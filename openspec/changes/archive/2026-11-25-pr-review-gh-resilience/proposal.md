# Proposal: pr-review-gh-resilience

## Why

The five-minute scheduled review run performs 171 sequential GitHub calls per reconcile over 85 tracked pull requests, and no `gh` invocation has a deadline. Measured on 2026-11-25: reconcile takes 157.5 s on a healthy path, about 3% of TCP connections to `api.github.com` black-hole (each costing roughly 30 s at gh's dial timeout), and a killed run leaves `.cache/pr-review/run.lock` behind, so every later scheduled delivery is refused until an operator removes it. One transient stall therefore costs the whole round instead of a few seconds.

## What Changes

- Every `gh` invocation runs under a deadline (default 20 s) and read calls retry under a shared policy: at most three attempts with a short backoff. Write calls keep single-shot semantics under the same deadline. The deadline and retry parameters have documented defaults and environment-variable overrides.
- Reconcile reads are batched: one authenticated-login read, one lightweight open list, and chunked detail reads of at most 25 pull requests per request that carry mergeability, merge state and recent comments. A failed chunk falls back to per-pull-request detail reads, and one pull request's failure no longer costs the others.
- The run lock records the owner PID and its process start time, and a lock whose owner is gone or whose PID was reused is reclaimed automatically and reported.
- Preflight probes GitHub under a five-second deadline (two attempts) and bounds the base-branch fetch, so an unreachable GitHub is reported within seconds instead of after the platform connect timeout.
- Each command that takes the run lock appends one telemetry line to `.cache/pr-review/runs.jsonl` (duration, GitHub calls, transient failures, outcome), the read-only `preflight`, the plain `state` view and the landing `state` command write none, and `state --cleanup` keeps the most recent 2000 lines.
- `docs/pr-review.md` documents the deadline, retry, batching, lock-recovery, probe and telemetry behavior.

## Capabilities

**New Capabilities**: None.

**Modified Capabilities**:

- `pr-review-pipeline` — the retry boundary gains a per-call deadline and a three-attempt read policy; poll and batch wording follows the shared policy; new requirements cover batched owner-review reads, run-lock recovery, the bounded preflight probe and run telemetry.

## Impact

Affected code: new `scripts/gh-exec.mjs`; `scripts/gh-retry.mjs`, `scripts/pr-review-watch.mjs`, `scripts/pr-review-owner-review.mjs`, `scripts/pr-review-land.mjs`, `scripts/pr-local-shared.mjs`; `docs/pr-review.md`; new `test/gh-exec.test.mjs` and `test/pr-review-doc.test.mjs`, plus the existing watch, owner-review, land, retry, lock and local-retarget tests.

No plugin runtime surface changes: tool descriptions, schemas, projection, skills and the packed runtime paths stay as they are, because the changed scripts are repository tooling rather than plugin runtime. No dependency, configuration schema or state-file schema change is required; the lock owner file gains fields that older runs simply report as absent.
