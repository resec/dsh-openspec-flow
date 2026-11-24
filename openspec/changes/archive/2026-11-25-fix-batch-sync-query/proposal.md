# Batch list resilience

## Why

`sync-batch` reads the open list with one `gh pr list` request that carries every open pull request's changed files and merge state. With 82 open pull requests that request spent 9-12 seconds server-side and GitHub's gateway cut it off with `HTTP 504` twice in the previous scheduled run and `HTTP 502`/`504` again in the diagnosis session, while the same request without either field succeeded (0.8-9 seconds) and the full-field request succeeded only once. The batch therefore cannot update labeled behind branches, and an unavailable list aborts the whole scheduled run instead of falling through to the landing or review step. The poll sends the same shape of request (`files` plus `statusCheckRollup`) and measured 4.4-8.8 seconds, so the same gateway failure can make review candidates disappear from a run.

## What Changes

- The batch reads the open list with scalar fields only and obtains each candidate's changed paths with one request per pull request, so no single request carries file lists for the whole open list.
- The batch and the poll retry a read request that fails with a transient gateway error once before deciding the read is unavailable; a write keeps single-shot semantics, so a branch update, a merge or a comment is never replayed.
- An unavailable batch list reports an `unavailable` outcome with `changed: false` and writes nothing instead of throwing, so the scheduled run continues with the landing or review step and reviews stay available.
- The poll keeps its single full-detail request as the primary read, retries it once, and on a remaining gateway failure falls back to a scalar list plus one detail request for each pull request that still needs evaluation; the fallback reports the same candidates and marks the result `fallback: true`, and fails rather than reports a partial candidate list.
- `docs/pr-review.md` states the batch's per-pull-request inspection, the unavailable outcome and the poll fallback.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `pr-review-pipeline`: batch inspection per pull request, the unavailable batch outcome, and the poll's retry and fallback.

## Impact

- `scripts/pr-review-land.mjs`: `syncBatch` reads the scalar list and inspects each candidate's changed paths separately.
- `scripts/pr-review-watch.mjs`: `pollPullRequests` retries its list request and reads the fallback list plus per-pull-request detail.
- `scripts/`: a shared transient-failure helper used by both commands, with its own test.
- `test/pr-review-land.test.mjs` and `test/pr-review-watch.test.mjs`: regression coverage for the request shape, the retry, the unavailable outcome and the fallback.
- `docs/pr-review.md`: the batch and poll sections — the `sync-batch` Landing paragraph, scheduled step 6, the poll description in Commands, the Session flow step 3 and the passage that describes batch and poll failures; `AGENTS.md` only if its batch sentence no longer matches.
- No change to the landing gates, the `mergeable` authorization, the 20-update limit, the 10-second head wait, fork handling, or any branch write rule.
