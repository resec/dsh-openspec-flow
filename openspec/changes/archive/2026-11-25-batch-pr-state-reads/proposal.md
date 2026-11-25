# Batch the cleanup state read

## Why

`state --cleanup` runs in every scheduled round and issues one `gh pr view --json state` per tracked pull request plus one per local owner entry. The last recorded round spent 48.5 s and 85 calls in that step alone, about 68% of the 71.6 s round, and it holds the run lock for the whole time. The only state it needs is one scalar per number, so one batched request can return all of them.

## What Changes

- `state --cleanup` reads the state of every tracked pull request and every local owner entry in batched GraphQL requests of at most 100 numbers each, and decides removals from that result instead of running `gh pr view` per entry.
- The repository is identified from the origin remote once per run; owner-review reconcile reuses that resolver instead of its private copy.
- A batch that fails for a non-transient reason is re-read one number at a time; a transient network failure is reported after its read attempts instead of repeated per number.
- `mergedAt` leaves the read because no decision consumed it.
- Removal rules, output shape, telemetry fields and the run-lock scope stay unchanged; only the number of GitHub calls drops.
- `docs/pr-review.md` describes the batched read and its fallback.

## Capabilities

### Modified Capabilities

- `pr-review-pipeline`: `state --cleanup` gains a batched state-read requirement. The existing cleanup and local-entry removal requirements keep their behavior; their deltas are not touched.

## Impact

- `scripts/pr-review-watch.mjs`: `cleanupClosedPullRequests`, `cleanupLocalEntries`, a batched state reader and the moved origin-remote resolver.
- `scripts/pr-review-owner-review.mjs`: reconcile imports the shared resolver.
- `test/pr-review-watch.test.mjs`, `test/pr-review-owner-review.test.mjs`: batched-read, fallback and agreement coverage.
- `docs/pr-review.md`: session-flow wording and the measured call count.
- `openspec/specs/pr-review-pipeline/spec.md`: gains the new requirement at archive.
