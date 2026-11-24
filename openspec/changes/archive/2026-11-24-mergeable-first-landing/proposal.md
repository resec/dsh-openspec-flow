# Mergeable-first landing

## Why

The watch reads only the newest 50 open pull requests for landing candidates and orders every review queue by creation time. A `mergeable`-labeled pull request older than that page is invisible, and when its recorded head has moved it waits behind every newer review candidate, so the documented landing-first order cannot take effect. The scheduled session also syncs one branch per run, so a set of behind-labeled pull requests is processed one at a time instead of becoming reviewable together.

## What Changes

- Read every open pull request returned by the GitHub CLI ceiling (1000) in `poll` and `candidates`, instead of the current 50 or 100 rows; rows beyond the ceiling are a documented bound, not a silent omission.
- Order review candidates whose pull request carries `mergeable` before other candidates, preserving the existing order inside each group; the label never makes an ineligible pull request a candidate.
- Add `sync-batch`: in one run, update eligible same-repository pull request branches that are open, non-draft, based on `main`, labeled `mergeable`, behind `main` and conflict-free. A fork branch, an up-to-date branch and a branch whose update is refused are skipped, and one refusal does not stop the batch. The batch evaluates every returned row, applies at most 20 updates per run and waits at most 10 seconds per updated head. It stops the run only when it changed a head; an empty or fully refused batch, or a batch refused by a held landing lock, continues to the landing or review step. It creates no landing entry and consumes no landing phase.
- Document the scheduled order: reconcile, cleanup, preflight, finish or choose a landing, batch-sync the remaining labeled behind branches, then review with `mergeable` candidates first; a batch that changed nothing falls through to that step.
- Update the scheduled session prompt to that order.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `pr-review-pipeline`: candidate discovery coverage, mergeable-first review ordering and batch same-repository branch sync.

## Impact

- `scripts/pr-review-watch.mjs`: the poll reads the 1000-row ceiling and orders mergeable-labeled candidates first.
- `scripts/pr-review-land.mjs`: `candidates` reads the 1000-row ceiling and `sync-batch` is added.
- `test/pr-review-watch.test.mjs` and `test/pr-review-land.test.mjs`: regression coverage for the discovery bound, ordering, batch sync and its refusals.
- `docs/pr-review.md`: commands, session flow, landing and schedule; the Non-goals sentence that allows only `sync` also names `sync-batch`.
- `AGENTS.md`: the one-PR-at-a-time sentence and the single-sync description gain the batch exception.
- The DSH scheduled task prompt, which is configuration rather than a repository file.
