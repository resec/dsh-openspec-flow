# Design: Batch the cleanup state read

## Context

See `proposal.md` — Why. Today `cleanupClosedPullRequests` calls `gh pr view <n> --json state,mergedAt` once per tracked pull request and `cleanupLocalEntries` calls `gh pr view <key> --json state` once per local entry. Both go through the shared read policy: a 20 s deadline, three attempts, 1 s and 3 s backoff.

Measured on 2026-11-25 at `c97d784`, Node 24, repository `resec/dsh-openspec-flow`:

- One `gh pr view <n> --json state`: 682 ms; with `mergedAt`: 953 ms. Telemetry for the last `state --cleanup`: 48,523 ms and 85 calls, one per tracked entry while the local set was still empty; with today's three local entries the batch carries 88 numbers.
- GraphQL `query{repository(...){p<n>:pullRequest(number:<n>){state}}}` with 88 aliases: 633 ms, `rateLimit.cost` 1. With 255 aliases: 826 ms, cost still 1.
- `gh pr list --state all --limit 1000 --json number,state`: 1,224 ms over two REST pages for the 101 pull requests in this repository.

## Goals / Non-Goals

Goals: one GitHub request for the current 88 numbers; identical removal decisions, retained reports and output shape; a fallback that cannot turn an outage into one read per number; one origin-remote resolver shared with reconcile.

Non-Goals: batching the reconcile detail reads (13.6 s / 6 calls, a separate target), moving the preflight before cleanup in the scheduled flow, caching the state between commands, and any change to removal rules, lock scope or telemetry fields.

## Decisions

### Batch by pull-request number instead of listing the repository

A repository listing would work but couples the read to the list's completeness and the `--limit` ceiling, and it fetches every pull request rather than the tracked ones. Parallel `gh pr view` calls would keep 85 calls and consume about 20% of the hourly REST quota. A cache written by reconcile would save only 0.6 s while adding a cross-command staleness window. The by-number query is exact regardless of repository size.

### Chunk size 100

The cost stayed at one point from 88 to 255 aliases, so a chunk of 100 keeps the current set in one request while bounding the query text at about 4.5 KB and the fallback width. The owner-review chunk of 25 is for detail reads that fetch comments and files; the state read carries no connection.

### A missing node is re-read on its own

A number that is not a pull request, or that moved away, returns a null alias. The reader resolves that number before it returns, so a caller sees one map with every requested number in it. Reading it individually keeps today's failure reporting: a failed individual read fails the command with that number, instead of silently skipping the entry. The same per-number path runs when the resolver returns no slug, so a checkout whose origin is not GitHub keeps working without a batch.

### Only non-transient batch failures fall back per number

A transient failure is already retried three times by the read policy. Repeating it once per number would stretch an outage to 88 × 3 attempts, roughly an hour and a half. The batch fails instead, which is what today's first failed per-number read does. Rejected queries, a missing repository or a permission error are reproducible, so the per-number fallback preserves today's behavior for them and still removes stale entries.

### Share the resolver and drop mergedAt

`repositorySlug` moves into `scripts/pr-review-watch.mjs` and is exported; `pr-review-owner-review.mjs` imports it, following the direction it already imports from the watch. No cycle is introduced. `mergedAt` was requested but read by nothing, so the batched query asks only for `state`.

## Risks / Trade-offs

- GraphQL unavailable for a deployment-specific reason (proxy, token scope) → the non-transient fallback restores one read per number; telemetry makes the jump visible.
- An offline round fails after one batch (about 64 s with the default attempts and deadline) instead of after 88 retried reads.
- The origin remote no longer naming GitHub → the resolver returns undefined and the per-number fallback runs, as today.
- Stale documentation → the session-flow sentence and the batching paragraph are updated in the same commit as the wiring.

## Migration Plan

No persisted format changes: `state.json` and `local-prs.json` are read as before, and the batched read produces the same values the per-number reads produced. Rollback is a revert.

## Open Questions

None.
