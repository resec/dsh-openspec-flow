# Design

## Context

See [proposal.md](proposal.md) - Why.

`syncBatch` currently reads the open list in one request: [pr-review-land.mjs](../../../scripts/pr-review-land.mjs) `syncBatch` requests `number,headRefName,headRefOid,baseRefName,isDraft,isCrossRepository,labels,mergeStateStatus,files` at `--limit 1000` and uses `files` only to test `activeChangeNames(files).length === 1`; `mergeStateStatus` is unused there because `syncLanding` reads each pull request again on its own. `listLandingCandidates` in the same file already follows the cheap-list pattern: it lists `number,labels` and then reads the `mergeable`-labeled candidates one by one.

`pollPullRequests` in [pr-review-watch.mjs](../../../scripts/pr-review-watch.mjs) reads `number,headRefOid,baseRefOid,baseRefName,isDraft,statusCheckRollup,files,labels,updatedAt` in one request and passes the rows to `filterCandidates`. The detail requests the fallback needs are one pull request each, which the same file already issues in `preparePullRequest` with `statusCheckRollup` and `files`.

Diagnosis measurements on 2026-11-24 with 81 open pull requests (`gh pr list --state open --limit 1000 --json <fields>`):

| Fields | Outcome |
| --- | --- |
| `number` | 0.6-0.7 s, succeeded |
| no `files`, with `mergeStateStatus` | 6.3-9.1 s, succeeded |
| with `files`, no `mergeStateStatus` | 3.7-5.0 s, succeeded |
| batch list as shipped (`files` + `mergeStateStatus`) | 11.0 s `HTTP 502`, 11.4 s `HTTP 504`, one 9.0 s success, two `HTTP 504` in the previous scheduled run |
| poll list as shipped (`files` + `statusCheckRollup`) | 4.4-8.8 s, succeeded |
| scalar list without `files` and `mergeStateStatus` | 0.84 s, 19.5 KB |
| one pull request's `files` + `statusCheckRollup` | 0.63 s, 1.1 KB |

The batch failure correlates with requesting per-pull-request file lists and merge state for the whole open list at once; removing either field made the request succeed. At diagnosis the repository had 82 open pull requests, 14 carrying `mergeable`, and 45 rows in the poll that need a detail request because their recorded head is unknown or moved.

## Goals / Non-Goals

Goals:

- Make both list reads immune to the gateway timeout that a single over-large GraphQL request triggers, without changing eligibility, ordering, limits or write rules.
- Keep the scheduled run alive when a batch list is unavailable.
- Keep the poll's steady-state cost at one request while making a gateway failure recoverable.

Non-Goals:

- No cursor-based GraphQL pagination, no parallel requests and no change to the 1000-row ceiling.
- No change to the 20-update limit, the 10-second per-head wait, the landing lock, the review rounds or the label rules.
- No unconditional split of the poll request: see Decision 4.

## Decisions

### Decision 1: batch reads scalars, then one request per candidate

The batch lists `number,headRefName,headRefOid,baseRefName,isDraft,isCrossRepository,labels` and asks each pull request that passes the scalar gates for its changed paths with `gh pr view <n> --json files`. The eligible set keeps its current meaning, so the batch still syncs exactly the same rows.

Counting stays explicit. `checked` is the number of rows the scalar list returned. `eligible` holds the rows whose changed-path request found exactly one active change, so a row changing no active change or several is in neither list. Each eligible row attempted until the 20-update limit adds one `results` entry, and an inspection refusal adds its own refusal entry with a reason naming the pull request and the read failure. `remaining` counts eligible rows without a result, so an inspection refusal and a row that was never inspected consume no part of it. The limit bounds writes and attempted eligible rows, not inspections.

Alternatives rejected:

- `gh pr list --search "label:mergeable"` with `files`: one request instead of 14 probes, but the search index lags a fresh label by minutes, which delays a branch the maintainer just authorized, and it would redefine `checked` from "every open row" to "labeled rows".
- Keep the shipped request and page it: `gh pr list` has no offset, so paging needs a hand-written GraphQL query with cursors, which this change would then own.
- Read only the scalar list and let `syncLanding` refuse a multi-change row: fewer requests, but it would add those rows to `results` as refusals and change `eligible` and `remaining`.

### Decision 2: one retry, on read call sites only

A shared helper under `scripts/` retries a call once after 2 seconds when the failure text reports an HTTP 5xx status, a gateway timeout or a reset connection, and rethrows every other failure immediately. The helper wraps individual call sites, never a `gh` runner: the batch passes its open-list request and each changed-path request through it, the poll passes its full-detail list, its fallback scalar list and each fallback detail request. The batch's update-branch call, the head poll after an update, `gh pr merge`, `gh pr comment`, the authenticated-login read and label writes keep their single-shot semantics through the unwrapped runner. Tests inject `retryDelayMs: 0`.

Replaying a write would break a documented promise: an update-branch retry after `HTTP 502` re-sends the request with an `expected_head_sha` GitHub has already consumed, so the branch is updated but the batch reports a refusal and records no `syncs` entry; a replayed `gh pr comment` publishes the same report twice, which the `State, lock and failure recovery` requirement forbids. A single retry covers the observed `502`/`504`, which are gateway-level and typically clear on the next call, without turning an outage into a long run.

### Decision 3: an unavailable batch list reports and exits successfully

When the scalar list still fails, `syncBatch` returns `{ apply, unavailable: true, locked: false, changed: false, checked: 0, eligible: 0, updated: 0, results: [], remaining: 0, error }` and the command writes it as JSON with exit status 0. All three `syncBatch` outcomes — normal, locked and unavailable — carry `apply`, so a consumer reads one key across them. The scheduled prompt already routes `changed: false` and `locked: false` to the landing or review step, so no prompt change is needed. Throwing instead would abort the run before any review, which is the failure this change removes. Non-transient failures (an unauthenticated `gh`, a usage error, a malformed response) still throw, so a real configuration problem stays visible.

### Decision 4: the poll keeps its full-detail request and falls back on failure

The poll retries the full-detail request once. On a remaining gateway failure it lists scalars (`number,headRefOid,baseRefOid,baseRefName,isDraft,labels`), then issues `gh pr view <n> --json files,statusCheckRollup` for every row that still needs evaluation: rows whose recorded entry does not already record the current head as `commented`. The merged rows go through the same `filterCandidates`, so ordering, the recorded-head rule and the `mergeable` order keep one implementation. The result carries `fallback: true`. Both the full-detail read and every fallback read go through the retry boundary of Decision 2, while the `comment` publish path keeps the shared runner unwrapped, so a published report is never replayed. A remaining detail failure fails the poll rather than silently dropping a candidate.

Alternatives rejected:

- Split the poll unconditionally: measured 45 detail requests at diagnosis at 0.63 s each, about 27 seconds and 45 times the request count on every poll, for a query that has not failed yet.
- Drop `statusCheckRollup` from the primary request: the green-CI gate has no cheaper source.
- Cap the fallback at the labeled rows: unlabeled rows stay review candidates, so that would omit candidates the current read reports.

### Decision 5: inspection counts stay bounded by the open list

The batch issues one changed-path request per labeled row that passes the scalar gates: 14 at diagnosis, one per run. The poll fallback issues one detail request per row needing evaluation: 45 at diagnosis, only on a degraded poll. At 12 scheduled runs per hour the added load is about 170 requests per hour for the batch and about 540 for a poll that is degraded on every run, inside the authenticated limit of 5000 per hour, and the fallback detail keeps the 1000-row ceiling.

The ceiling is the count bound, not a time bound: 1000 labeled rows at about 0.6 s each is roughly ten minutes of sequential inspections, and 1000 fallback detail requests are the same order. Both exceed the five-minute schedule when the repository reaches that scale. The label is the maintainer's authorization and stood at 14 rows, so the change keeps the ceiling as the documented bound instead of adding an inspection cap that would make `eligible` and `remaining` depend on where the cap fell. A cap is a separate decision for a change that also bounds the batch's existing serial git work.

## Risks / Trade-offs

- [The batch now takes one extra request per labeled row, about 0.6 s each] → It runs only for labeled rows, 14 at diagnosis, each inspection is retried at most once, and the open-list ceiling bounds the worst case at 1000 rows, which Decision 5 accepts as a roughly ten-minute ceiling-scale bound rather than an inspection cap.
- [A degraded poll issues one sequential detail request per row needing evaluation, 45 at diagnosis and up to the open-list ceiling] → The fallback is entered only after two failed full-detail attempts, marks the result `fallback: true`, and the next run retries the primary read; a 1000-row degraded poll is documented as the slow path rather than silently omitting rows.
- [The transient classifier could miss an unfamiliar gateway message and fail fast] → Unrecognized errors are treated as non-transient by design, so a new gateway message costs one failed run that reports the error, not a silent retry storm.
- [An unavailable batch outcome could hide a persistent problem] → The JSON carries the `error` text and the run still reports it; non-transient errors keep throwing.
- [The poll fallback could drift from `filterCandidates`] → The fallback builds row objects and calls `filterCandidates`; it adds no filtering of its own.
- [A fallback detail failure fails the poll, which stops the run as before] → The failure reports the pull request and reason, and the next run retries; silence is the outcome the spec forbids.

## Migration Plan

No data migration: `landings.json` and the watch state keep their shape. Merge the change to `main`; the scheduled task runs the scripts from the checkout, so no bundle repack is needed. Rollback is a revert of the commit, which restores the shipped single-request reads and the thrown batch failure.

## Open Questions

None.
