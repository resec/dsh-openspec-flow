# pr-review-gh-resilience

Bound GitHub calls in the PR review pipeline: per-call deadline, read retries, batched reconcile reads, automatic stale run-lock recovery, short-deadline preflight probe, and per-run telemetry.

## Verification results

Measured on the maintainer host on 2026-11-25 with Node 24.22.2 against the live repository (85 tracked pull requests):

- `node scripts/pr-review-owner-review.mjs --reconcile --apply`: 13.7 s, 14.6 s and 17.0 s across three runs, 6 GitHub calls each (one login, one open list, three detail chunks and one file chunk) against 157.5 s and 171 calls before the change.
- `preflight --json` against an unroutable GitHub host (`GH_HOST=10.255.255.1`): `online: false`, `reason: "github-unreachable"` in 10.06 s, from the two 5-second probe attempts.
- One scheduled script round (reconcile, cleanup, preflight, landing state, candidates, batch sync, poll): 71.6 s wall clock, no run lock left behind. `state --cleanup` is the largest step at 48.5 s and 85 calls because it still reads each tracked pull request once; that batching is out of this change's scope.
- Telemetry lines recorded by that round:

```json
{"command":"owner-review --reconcile","durationMs":13626,"ghCalls":6,"transientFailures":0,"outcome":"ok"}
{"command":"state --cleanup","durationMs":48523,"ghCalls":85,"transientFailures":0,"outcome":"ok"}
{"command":"poll","durationMs":5705,"ghCalls":1,"transientFailures":0,"outcome":"ok"}
```

- Lock-recovery drill: a run holding `run.lock` was killed with SIGKILL; the next `poll --json` printed `stale-lock-reclaimed pid=<pid> at=<iso>` on stderr, returned its candidate list and released the lock.
- `npm run verify` on the committed tree: pass, no coverage violations (line 98.63%, branch 93.64%, function 99.21%).

