## Context

See `proposal.md` for the motivation and `specs/pr-review-pipeline/spec.md` for the behavior contract.

The review watch already owns the PR state under `.cache/pr-review/state.json`, the repository run lock and the trusted review marker. The landing command requires `mergeable` and never writes labels. The advisory label has to be derived from live GitHub state rather than from a local report, because a head push, a `main` advance, a check rerun, or a maintainer label change can invalidate it without a new review.

## Goals / Non-Goals

**Goals**

- Add and remove `owner-review` deterministically from the same gates the landing command uses, minus `mergeable`.
- Clear the signal on the events that make it stale: head change, main-induced conflict, CI regression, loss of trusted pass, `mergeable`, and any other non-label gate failure.
- Reconcile existing pull requests, including labels left behind after a state reset or a manually added label.
- Keep the review watch read-only, keep landing authorization unchanged, and keep the label writes isolated and auditable.

**Non-Goals**

- No change to `scripts/pr-review-land.mjs` gates, merge sequence or archive flow.
- No automatic `mergeable` write and no landing triggered by `owner-review`.
- No contributor-branch write, PR code execution, or new plugin tool.
- No label-event webhook; the ten-minute scheduled session is the convergence interval.

## Decisions

### Separate command instead of extending the review watch

Add `scripts/pr-review-owner-review.mjs` rather than putting label writes into `poll`, `prepare` or `comment`. The watch remains the read-only review surface except for its explicit comment publish. A separate command can be dry-run, tested in isolation, and invoked independently by the scheduled session or an operator. It imports the existing watch helpers for state, paths, locking, active-change extraction, CI checks and the trusted marker instead of duplicating them.

`trustedPass` moves from `scripts/pr-review-land.mjs` to `scripts/pr-review-watch.mjs` next to `hasTrustedMarker`; both the landing command and the new command import it. The landing command re-exports it so its existing test import and gate code stay unchanged. This is a pure move: the landing gates keep their behavior. The new command reads the authenticated login through its own `gh` runner; the landing command keeps its private `ghLogin`.

### Decide from live pull-request state, record only the labeled head

The command reads the PR fresh for every decision: state, draft, base, head, mergeable status, merge state, CI rollup, files, labels and comments. It reads the watch entry only to require a published review for the same head and to compare against the head that was labeled. The label's presence on GitHub is authoritative for the action; `.cache/pr-review/state.json` records `ownerReview: { head, at }` only so a later head change can be distinguished from the same head.

The state entry is optional. `preparePullRequest` preserves an existing `ownerReview` field when it updates the head, so a prepare that runs before reconciliation does not erase the evidence that the label belonged to the old head. A missing field is treated as a label with unknown provenance: it is removed unless the current head qualifies, in which case it is adopted and the head is recorded.

### Eligibility

The label is added only when all of these hold:

- the PR is open, non-draft and targets `main`;
- the files name exactly one active change;
- `statusCheckRollup` is non-empty and every entry is successful;
- `mergeable` is `MERGEABLE`, and `mergeStateStatus` is not `DIRTY` or `BLOCKED`;
- the `mergeable` label is absent;
- the watch entry names the current head with status `commented`;
- a trusted `pass` comment exists for the current head.

A clean local `main` is not part of the decision. It is a precondition for running the landing command, not a property of the pull request, so a dirty main worktree does not hide a ready PR from the owner queue.

The source branch's base tip and GitHub's `BEHIND` state do not disqualify the PR. Landing rebases; only a conflicting state removes the signal.

### Invalidation

The label is removed when any of these hold:

- the current head differs from the recorded labeled head;
- the `mergeable` label is present;
- the trusted pass marker no longer names the current head;
- CI is no longer green;
- `mergeable` is `CONFLICTING`;
- `mergeStateStatus` is `DIRTY` or `BLOCKED`;
- the PR is closed, becomes a draft, changes base, or no longer names exactly one active change;
- the watch entry is missing or does not name the current head.

When `mergeable` is `UNKNOWN`, an existing label on a tracked PR is kept and no new label is added, unless another removal condition applies; the next reconcile resolves the state. Removing on `UNKNOWN` would make the signal flicker during GitHub's asynchronous mergeability calculation.

A head change removes the label even when the new head already has a trusted pass; the same command then evaluates the new head and, when every non-label gate passes, adds the label again and records the new head. The write sequence is remove then add, so the signal never claims continuity across a push.

### Reconcile and schedule order

`owner-review <n>` handles one PR. `owner-review --reconcile` lists open PRs and fetches tracked PRs. It removes labels that fail a gate other than `mergeable: UNKNOWN`, adds labels to open tracked PRs that qualify, and removes `owner-review` from open PRs that carry it without a watch state. Processing one PR at a time keeps a failure localized; a failed label write is reported and leaves state untouched for the next reconcile.

The scheduled session runs `state --cleanup`, then `owner-review --reconcile --apply`, then polls and reviews candidates. After a published `pass`, it runs `owner-review <n> --apply` for that PR. The reconcile pass clears stale labels before review work and backfills PRs whose pass was published before this feature existed; the per-PR call makes a new pass visible without waiting for the next ten-minute tick.

### State and failure behavior

`.cache/pr-review/state.json` keeps schema version 1 and adds an optional `ownerReview` object. The command runs under the existing run lock. A failed add or remove does not change the review state; the next reconcile retries. The command never deletes the watch entry and never touches a worktree.

## Risks / Trade-offs

- [Stale signal between scheduled runs] → The ten-minute reconcile is the convergence interval; an explicit command can run immediately after a head push or label change.
- [GitHub mergeability is asynchronous] → Keep the label on `UNKNOWN`; add only on `MERGEABLE`; let the next run resolve.
- [Reconcile backfills many labels on first apply] → Dry-run is the default and prints the planned additions and removals before `--apply`.
- [A manual label conflicts with automation] → The label is documented as automation-owned; reconcile removes orphaned or ineligible labels and adopts a qualifying one.
- [Label write failure hides a ready PR] → Report the failure without changing review state; the next reconcile retries and the PR remains reviewable.
- [The PR head changes between the decision and the label write] → Record the observed head; the next reconcile compares the current head and removes the stale label.

## Migration Plan

No data migration. The existing `state.json` entries remain valid without `ownerReview`. The `owner-review` label must exist in the repository; it already does. Before the first `--apply`, verify it with `gh label list --search owner-review`; if it is absent, create it with `gh label create owner-review --description "require owner review before auto merge"`. Run `owner-review --reconcile` without `--apply` first, inspect the plan, then apply. Rollback removes the new command, entrypoint, tests and documentation; removing the label from open PRs is optional because the command is the only writer.

## Open Questions

None.
