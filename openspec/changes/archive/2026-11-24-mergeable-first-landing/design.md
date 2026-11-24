# Design

## Context

See [proposal.md](proposal.md) - Why. The watch polls with a small fixed `gh pr list --limit`, orders candidates exactly as GitHub returns them, and `sync` updates one pull request per invocation. `docs/pr-review.md` already documents landing before review and a cross-session `landing.lock`, but the scheduled prompt has not followed it while the review queue has candidates, and the landing listing cannot see pull requests outside the newest page.

## Goals / Non-Goals

Goals:

- Discover every open pull request within the GitHub CLI ceiling in both the review poll and the landing candidate listing.
- Give `mergeable`-labeled candidates the front of the review queue without changing eligibility.
- Let one run update up to 20 eligible same-repository behind branches, bounded so the run stays inside its five-minute window and without consuming the one-phase landing allowance.
- Keep the documented landing-first order and the fixed scheduled session unchanged.

Non-Goals:

- No change to the `mergeable` authorization, the landing gates, the rebase merge or the archive/push sequence.
- No change to fork branches, to PR code, or to the owner-review signal.
- No new concurrency: the batch is serial and one scheduled run still performs one logical step.

## Decisions

### A separate `sync-batch` command instead of widening `candidates`

`candidates` lists pull requests whose watch entry records the current head as `commented`, because a landing may only proceed from a reviewed head. The batch target is the opposite case: a labeled branch behind `main` whose head has moved, which must be updated before it can be reviewed. Folding that into `candidates` would either weaken the candidate contract or require a second mode. A new `sync-batch` command keeps `candidates` read-only and its eligibility unchanged.

### The batch runs without acquiring `landing.lock`

`sync` does not change `main`, creates no landing entry and consumes no landing phase. It does append a `syncs` record to `landings.json`, so the batch shares a file with a landing; the command therefore refuses while any lock is held and the batch runs under the watch's `run.lock`, which serializes scheduled deliveries. Acquiring `landing.lock` for a batch would need a synthetic pull-request number, a release path on partial failure and a second meaning for the lock, without protecting a mutation of `main`. A cross-session operator landing that acquires the lock after the batch's per-pull-request check can still interleave the `syncs` write with its own read-modify-write; this residual window is recorded under Risks.

### The batch is serial, bounded and continues after a refusal

Each pull request reuses the existing `sync` eligibility checks and update-branch call. A refusal (fork, conflict, moved head, missing label, failed API call) is recorded for that pull request and the next one runs. The batch evaluates every returned row, applies at most 20 updates per run and waits at most 10 seconds per updated head; the remainder is left to the next run. The batch stops the run only when it changed a head. An empty batch, an all-refused batch and a batch refused by a held lock fall through to the landing or review step so reviews stay available, matching the lock-isolation requirement.

### Poll ordering is stable and does not change eligibility

`poll` requests `labels` with the existing fields and sorts only the candidate list: labeled candidates first, each group in the original order. `filterCandidates` remains the single eligibility gate, so a labeled draft, failing check or already-commented head stays out. The landing listing keeps GitHub's order because every entry there already carries the label and landing advances one candidate per run.

### Read the GitHub CLI ceiling

Both listings request `--limit 1000`, the GitHub CLI ceiling. This is a bounded read: a row within the 1000 rows is always evaluated, and `docs/pr-review.md` states that a pull request beyond the ceiling is not discovered rather than promising unbounded pagination. The alternative - `gh api --paginate` and reconstructing the check rollup and file lists by hand - would duplicate `gh pr list`'s projection and is not justified while the repository has 73 open pull requests. Tests use a handler that truncates at the requested limit, so a regression to a smaller page fails and the 1000th row is covered.

### The scheduled prompt is configuration, not a second specification

`docs/pr-review.md` remains the authority for the run order. The DSH schedule prompt is rewritten to the same order after the change lands; it no longer carries its own older sequence. The prompt keeps the fixed session and five-minute interval because the final review must resume the reviewer started in that session. The order is documentation and configuration rather than a new sequencing requirement; the main `Scheduled run sequencing` requirement remains authoritative and this change does not modify it.

## Risks / Trade-offs

- [A batch updates several heads at once and starts several CI runs] -> The batch is serial and bounded; CI queueing simply delays the next review, which the schedule already tolerates.
- [An update-branch call fails for one pull request] -> The failure is reported and the batch continues; the next run retries that branch because it is still behind and labeled.
- [A batch changes heads while a review is `prepared`] -> The watch entry no longer names the head, so the next poll reviews the new head; no merge can use the stale entry.
- [A batch runs while a local owner is landing] -> Any held lock refuses the batch; reviews continue as the lock isolation requires.
- [A batch and a cross-session operator landing share `landings.json`] -> The batch checks the lock per pull request and holds the watch `run.lock`; an operator that acquires the lock after that check can still interleave the `syncs` write, so the documented operator path avoids landing during a running batch.
- [The 20-pull-request bound and the 10-second head wait can approach the five-minute window on a worst-case batch] -> The typical head becomes visible quickly; a slow head is reported and skipped, and the next delivery continues from the remaining behind branches.
- [Old `failed` landing entries on labeled pull requests] -> `prepare` removes and recreates a pre-merge entry, so no manual cleanup is required; the listing still refuses them until their head is reviewed.

## Migration Plan

No state migration. Deploy the scripts and docs on `main`, then update the scheduled task prompt to the documented order. Existing watch entries stay valid; the first run after deployment evaluates the previously invisible labeled pull requests and reports their head mismatch as refusals until their new heads are reviewed. Pull requests beyond the documented ceiling stay out of scope until the read is widened.

## Open Questions

None.
