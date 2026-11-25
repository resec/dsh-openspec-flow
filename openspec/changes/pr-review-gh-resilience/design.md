# Design: pr-review-gh-resilience

## Context

See proposal.md — Why. Current mechanics that constrain the approach:

- Four scripts spawn `gh` through their own local helper (`capture` in `scripts/pr-review-watch.mjs`, `ghText` in `scripts/pr-review-owner-review.mjs`, `capture` in `scripts/pr-review-land.mjs`, `run` in `scripts/pr-local-shared.mjs`), and none passes `timeout` or `maxBuffer` to `spawnSync`. The only bound on a stalled call is gh's own 30-second dial timeout, and a stalled response after the connection has no bound.
- `withGhRetry` exists in `scripts/gh-retry.mjs` with a single retry and is used only by the poll and the landing sync; owner-review reads have no retry.
- Reconcile reads every tracked pull request twice (`gh pr view` plus `gh api user`), 171 calls for 85 tracked pull requests, measured 157.5 s.
- Measured on this host on 2026-11-25: `gh api user` 460 ms; `gh pr view` with all reconcile fields 865 ms; `gh pr list` with `number,state,isDraft,headRefOid,baseRefName,labels` for 92 pull requests 1.37 s / 19.6 KB; the same list plus `statusCheckRollup` 2.54 s / 70 KB; a GraphQL query for 25 pull requests selecting `mergeable`, `mergeStateStatus` and `comments(last:10)` 3.81 s / 108 KB; `mergeStateStatus` inside a 92-row list 8.9 s; a 92-row list selecting every reconcile field 11.4 s followed by HTTP 502. About 3% of new TCP connections to `api.github.com` black-hole; two of 65 measured attempts exceeded a 5-second connect bound, one exceeded 20 seconds.
- `withRunLock` is a plain `mkdir` and reports an instruction to remove the lock by hand; a run killed by an outer timeout leaves it behind, and later scheduled deliveries are refused.
- `preflight` calls `gh repo view --json nameWithOwner` (its value unused) and `git fetch origin main` with no deadline.
- `spawnSync` with a timeout returns `{ status: null, signal: 'SIGTERM', error: { code: 'ETIMEDOUT' } }` (verified), so a deadline kill is distinguishable from a normal non-zero exit.

## Goals / Non-Goals

Goals: bound every GitHub call, keep reads resilient, make reconcile cheap enough that a stall costs seconds, make a killed run self-healing, and persist enough per-run data to judge whether the path degrades.

Non-goals: changing network egress or kernel TCP settings, changing the five-minute cadence, cleaning up retained worktrees, changing label decisions, merging behavior, or the plugin's runtime surface (tool descriptions, schemas, skills, packed paths).

## Decisions

### Shared gh execution layer

New `scripts/gh-exec.mjs` owns spawning, deadlines and counters:

- `spawnGh(args, { cwd, timeoutMs, maxBufferBytes, spawn })` — default deadline 20 s, `maxBufferBytes` 32 MB (the current 1 MB default is a latent failure for list reads), throws a `GhTransientError` when the process is killed by its deadline; the error carries the command and the deadline.
- `ghRead(args, options)` — wraps `withGhRetry` with three attempts and a 1 s / 3 s backoff; `ghWrite(args, options)` — single attempt; `ghProbe(args, options)` — two attempts under a 5 s deadline.
- `ghCounters()` — per-process counters for attempted calls and transient failures, read by the telemetry layer.
- Parameter resolution: `PR_REVIEW_GH_TIMEOUT_MS` (default 20000), `PR_REVIEW_GH_ATTEMPTS` (default 3), `PR_REVIEW_GH_BACKOFF_MS` (default `1000,3000`), `PR_REVIEW_GH_POLL_TIMEOUT_MS` (default 5000, the single-shot head poll after an update), `PR_REVIEW_GH_PROBE_TIMEOUT_MS` (default 5000), `PR_REVIEW_GH_FETCH_TIMEOUT_MS` (default 30000). A value outside its documented range (timeouts 1 s – 300 s, attempts 1 – 5, each backoff delay 0 – 30 s) is ignored and the documented default applies, so a stray environment cannot weaken the bound and the choice has one rule rather than a clamp rule and a default rule.
- `withGhRetry` in `scripts/gh-retry.mjs` grows `attempts` and `delays` options, keeping its current default of one retry for existing callers until they migrate; `isTransientGhFailure` learns the deadline-kill error.

Alternatives considered: adding a `timeout` at each call site (rejected: four copies drift, and the deadline must be paired with retry classification to be useful); wrapping `gh` in `timeout(1)` (rejected: loses the structured exit reason and works only on Unix).

### Reconcile read batching

`reconcileOwnerReview` keeps its output shape, its per-pull-request error collection and `decideOwnerReview` unchanged. Reads become four phases:

1. One `gh api user --jq .login` for the authenticated login (460 ms), replacing 85 reads.
2. One lightweight list `number,state,isDraft,headRefOid,baseRefName,labels,statusCheckRollup` (2.5 s / 70 KB for 92 rows). `statusCheckRollup` stays here because it is cheap and the CI-regression removal needs it; `files` and `mergeStateStatus` do not, because they are expensive in a list.
3. Chunked GraphQL detail reads of 25 pull requests each, selecting `mergeable`, `mergeStateStatus` and `comments(last:10) { nodes { author { login } body } }` (3.8 s / 108 KB per chunk), requested only for pull requests that survive the cheap screening.
4. Per-pull-request `gh pr view --json files` only when a tracked head differs from the recorded head, so the active-change gate reads the current files; otherwise the recorded `change` is reused, because an unchanged head cannot have changed its file list.

Screening order mirrors the existing `structuralReason`: closed, draft, base not `main`, active-change count, green CI, `mergeable` label, missing state, head mismatch, state status, trusted pass. Each decision still runs through the existing decider with a normalized pull-request object assembled from the phase sources.

A chunk that fails on every attempt falls back to one `gh pr view` per pull request in that chunk (strictly the current per-pull-request read), bounded to 25 calls. A trusted-pass marker missing from the `last:10` window triggers one full-comment read for that pull request when the watch entry names the same head with status `commented`, which is the state the existing decider already requires before it reads comments at all; without that entry the marker is treated as absent, which matches today's per-pull-request read when no marker exists.

Alternatives considered: one mega list selecting every field (rejected: measured 502 at 11.4 s); REST reads per pull request (rejected: 46+ calls for the labeled set); GraphQL `search` (rejected: lower fidelity for merge state).

Cost check: 85 pull requests ≈ one login, one list and four chunks, about 18 s expected, ≤ 8 GitHub calls; a single deadline kill adds at most 20 s plus backoff.

### Run lock identity and recovery

`run.lock/owner.json` gains `pidStart` and `command`. `pidStart` is the process start time — field 22 (`starttime`) of `/proc/<pid>/stat`, in clock ticks since boot — read by taking the text after the last `)` of that file and splitting it, so a `comm` containing spaces or parentheses cannot shift the index; `starttime` is index 19 of that split (field 3 `state` is index 0). It is `null` when the file is unreadable. Acquisition on `EEXIST` reads the owner file and decides:

| Observation | Action |
| --- | --- |
| PID absent | reclaim |
| PID alive, `pidStart` matches | refuse and report the owner |
| PID alive, `pidStart` differs | reclaim (PID reuse) |
| Owner file unreadable or invalid, lock older than 10 minutes | reclaim |
| Owner file unreadable or invalid, lock younger than 10 minutes | refuse |
| `pidStart` absent (old format), lock older than 10 minutes | reclaim |
| `pidStart` absent, lock younger than 10 minutes | refuse |

The decision is not treated as binding once the directory moves. Reclaim renames `run.lock` to `run.lock.reclaim-<pid>`, then re-reads the moved `owner.json` and compares `pid`, `pidStart` and `at` with the stale owner it judged: when they match it deletes the moved directory and acquires a fresh lock; when they differ another reclaimer has already installed a live lock, so it renames the directory back (when `run.lock` is still absent) and refuses with the owner it found. Release follows the same rule: the `finally` removes `run.lock` only when its `owner.json` names this process's `pid` and `pidStart`, so a displaced owner cannot delete a later owner's lock. The reclaim prints `stale-lock-reclaimed pid=<pid> at=<iso>` on stderr so `--json` output stays parseable.

Alternatives considered: a TTL-only lock (rejected: steals a slow but live run); a heartbeat file (rejected: needs a timer and writes during long reviews); a flock file descriptor (rejected: Node has no portable advisory lock).

### Preflight probe

`preflight` replaces `gh repo view` with `gh api user --jq .login` under the probe deadline (2 × 5 s) and bounds `git fetch origin main` with a 30 s deadline. The rest of the result shape is unchanged. A transient probe failure retried by the second attempt reports online; both attempts failing report `github-unreachable` within about ten seconds.

### Run telemetry

Counters from `gh-exec` plus a wrapper around every run-lock command produce one JSON line per run-lock command: `{ at, command, durationMs, ghCalls, transientFailures, outcome }`, appended to `.cache/pr-review/runs.jsonl`. `state --cleanup` trims the file to the most recent 2000 lines. The read-only `preflight`, the plain `state` view and the landing `state` command, which take no run lock, write none. The line goes to the file only; stdout and `--json` results are untouched.

## Risks / Trade-offs

- Chunk fallback is slower than the batch (25 × 0.87 s ≈ 22 s) but bounded and strictly better than the current path → keep the fallback, log the fallback count in telemetry.
- Screening from batch fields could drift from `pr view` → parity test evaluates the same fixture through both paths and asserts equal actions, reasons and recorded heads; `decideOwnerReview` is untouched.
- The `last:10` comment window can miss an older trusted marker → a single-pull-request full-comment read when the watch entry names that head as commented; without the entry the marker is absent, which matches today's read.
- PID reuse within one `/proc` start-time tick could be mistaken for the same owner → conservative refusal, not a wrong reclaim; the window is milliseconds.
- An environment override can weaken the bound → an out-of-range value is ignored and the documented default applies.
- A deadline kill on a write can leave the remote in an unknown state → writes stay single-shot and their failure is reported exactly as today; the deadline only bounds waiting.

## Migration Plan

No data migration: the lock owner file gains optional fields, and a lock written by an older build ages out through the ten-minute rule. Commits land in this order, each independently revertible: execution layer, call-site migration, lock recovery, reconcile batching, probe and telemetry, documentation. A revert of the batching commit leaves the bounded layer in place, so no intermediate state returns to unbounded calls. Verification runs the unit suite, then live timings for `--reconcile --apply`, `preflight` and a full scheduled round, plus a lock-recovery drill (start a run, `SIGKILL` it, run again).

## Open Questions

None blocking. Chunk size 20 versus 25 is settled by measurement during apply; the specification fixes only the upper bound of 25.
