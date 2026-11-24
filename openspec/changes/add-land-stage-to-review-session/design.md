# Design

## Context

The scheduled watch and the landing command are separate programs. `poll` filters open pull requests to review candidates and skips a head whose watch entry is `commented` ([pr-review-watch.mjs:209](../../../scripts/pr-review-watch.mjs)), so a labeled pull request that already received its review never re-enters a session. `planLanding` already checks the label, the watch entry and the remaining gates ([pr-review-land.mjs:181](../../../scripts/pr-review-land.mjs)), but nothing lists its candidates and the landing state has no phase for a review that could not be resumed.

The independent reviewer is bound to the session that started the review. Each `apply-review.json` carries `changerSessionId` and `reviewers.slots[0].agentId`; `messageReviewer` sends to that agent through the current changer agent's subagent tree ([review.js:700](../../../lib/tools/review.js)). A later round reuses the slot ([review.js:1448](../../../lib/tools/review.js)), while `start` refuses a review whose record exists ([review.js:473](../../../lib/tools/review.js)). The running schedule is already a five-minute fixed target session; `docs/pr-review.md` still describes a ten-minute session with a new session per run. This change aligns the documentation and the prompt with the running schedule and does not change its recurrence.

## Goals / Non-Goals

- Goal: one fixed five-minute session that reviews, lands and finishes labeled pull requests.
- Goal: a read-only listing that names the landing candidates without changing watch semantics.
- Goal: the final landing review resumes the recorded reviewer instead of starting one.
- Goal: a failed resume has a recorded landing phase the operator can inspect and clear.
- Non-goal: changing `poll` candidate rules, the review record schema, label ownership, or the plugin tool surface.
- Non-goal: disposing or waiving findings automatically, replacing a reviewer automatically, or starting another session.
- Non-goal: cleaning the main worktree or managing another change's uncommitted directory.

## Decisions

### Candidate discovery lives in the landing script

`candidates` is a new read-only command of `pr-review-land.mjs`. It reads the open list, keeps pull requests that carry `mergeable`, joins the watch entry, and runs `planLanding` for each one, so the listing cannot drift from the landing authorization. It also runs `assertSingleLanding` before listing a pull request, because `plan` alone does not refuse a second concurrent landing and `prepare` does. A pull request that fails either check reports its first refusal reason.

The main worktree is checked once for the whole listing through a shared `assertMainReady` call made before per-pull-request evaluation. That check is a global precondition, so reporting it per pull request would repeat the same refusal for every row and hide the per-request reasons.

The command writes no state. It does not call `prepare` or any landing phase.

### One fixed session, one phase per run

The schedule keeps its five-minute recurrence and its fixed target session. Each run runs cleanup and then performs at most one of: review one candidate, prepare one landing, start the final review, record and merge, or archive and push. The landing entry records every phase except the final review itself: while that review is in flight the entry stays `prepared`, so the prompt infers the sub-step from the apply review record. A missed delivery only delays the next phase.

A new session per run was the documented alternative, but it breaks reviewer reuse: the reviewer subagent lives in the changer session's tree and `resume` cannot address it from another tree. The fixed session is the constraint the landing stage must satisfy.

### The final review resumes, never starts

The landing branch is a new tree for the same change, so the recorded apply review usually needs a new round. `start` refuses an existing record; `resume` opens the round and messages the recorded slot. When the resumed reviewer is unavailable, the run records the `review-failed` landing phase with the error through `state --fail <n> --error <text> --apply`, keeps the landing checkout and stops. `replace` is never automatic: the user has chosen a hard failure over substituting the reviewer, and an operator may still run it with a reason, which rebinds the same slot to a new reviewer inside the same session.

`review-failed` is a pre-merge phase and a durable stop: `candidates` omits a pull request in that phase, so the five-minute loop cannot repeat the same failed resume. Recovery is operator work: the documented steps repair the review record with a user-approved `openspec_review action=replace review=apply`, a fresh review after removing the locked record as the self-mode recovery does, a user-approved `openspec_review action=dispose review=apply` for an open finding in a pass report, or removal of the `mergeable` label to take the pull request out of the candidate list. After any of these steps, run `abandon <n> --apply` to clear the `review-failed` entry. For the record-repairing steps the next run prepares the landing again and the repaired record lets the final review resume; after label removal the pull request stays out of the candidate list. `abandon` alone is not a recovery because the blocker would remain; once the blocker is fixed, removing the entry is what clears the phase. The phase joins the abandonable set and keeps the checkout until it is cleared.

The review record's existing `verified` findings do not block `resume`; only `open` findings do. A pass comment that carries a non-blocking finding still leaves that finding open in the record, so a labeled pull request can be listed but fail the final resume; the run records `review-failed` instead of disposing the finding itself, and the user-approved dispose step above applies.

### Failures stay in the landing state

A failed preparation, conflict, resume, merge, archive or push is recorded on the pull request's landing entry and ends the run. The next run resumes from that phase, never merges twice and never forces main. A `review-failed` entry is the exception to automatic progress: it needs the operator to clear the reviewer problem, because the session must not replace the reviewer or retry the same resume every five minutes.

## Risks / Trade-offs

- [Long-lived session accumulates context] → Each run rebuilds its state from `state.json`, `landings.json` and the pull request, and the prompt fixes the phase order; no run relies on earlier conversation.
- [Five-minute cadence drops a delivery while a run is long] → `this_session` wait semantics deliver only the latest missed occurrence, and the landing phase makes a missed delivery harmless; the phase is retried next run.
- [Reviewer cannot be resumed after a session restart] → The run records `review-failed` and stops; recovery is an operator decision, not an automatic `replace`.
- [Documentation says ten minutes and a new session] → The Schedule section changes in the same commit to the fixed five-minute session; a mismatch would rebuild the split the change removes.
- [Main advances between prepare and merge] → The existing `merge` guard refuses and records `blocked`; the next run prepares again.

## Migration Plan

1. Add `candidates` and the `review-failed` recording command with their tests; run the landing test suite.
2. Update `docs/pr-review.md`, `AGENTS.md` and the task prompt to the fixed-session flow.
3. Confirm the running schedule already uses the five-minute recurrence and the fixed target session; if a deployment still has the documented ten-minute new-session schedule, set the recurrence and target there, and treat reviews started by an earlier one-off session as not resumable (they become `review-failed` and are cleared by the operator).
4. Dry-run `candidates` and `plan` for a labeled pull request before the first real `prepare`.
5. Rollback: stop the schedule and run the existing `state --forget` cleanup for a landing that must be abandoned.

## Open Questions

None. The user fixed the five-minute recurrence, the hard failure on a failed resume, and the untouched `openspec/changes/add-owner-review-signal/` directory.
