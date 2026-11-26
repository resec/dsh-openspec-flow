# Design

## Context

See `proposal.md` for motivation. The current draft record opens a round when `start` runs and advances `rounds.length` on the next `resume`. `resume` treats the latest round's report as the round's conclusion: a report opens the next round, and a missing report on a changed object is first closed with a synthetic `blocked` report before the next round opens. Both paths consume a round number even when the round reviewed no content.

The review record lives at `<git common dir>/openspec-flow/review/<store>#<change>/review.json`, with `round-N/brief.md` and `round-N/report.json` per round. The draft object hash binds the change artifacts and the intent file.

## Goals / Non-Goals

**Goals**

- A draft attempt that produced no substantive review keeps its round number across `resume`.
- Every replaced attempt stays readable with its brief, hashes, optional blocked report, cause, notice and archive time.
- Readiness, next actions and reviewer wakeups agree on what counts as a reviewed attempt.
- Old records stay readable without migration.

**Non-Goals**

- Changing apply review rounds. Apply review binds a committed tree and its `blocked` semantics stay as they are.
- Changing the review policy schema, the reviewer model, the wait limit or the round-cap removal.
- Moving review records out of their shared root.
- Reconstructing revisions for records written before this change.

## Decisions

### An attempt is substantive only with a pass or changes-requested report

`blocked` is the reviewer's statement that the review could not be performed; it is not a conclusion about the artifacts. The record therefore treats a round whose latest report is `blocked` exactly like an unreported round for readiness, next actions and resume. A missing report and a blocked report both mean "this attempt has no review content".

Alternative: treat every report as substantive. Rejected because it keeps the reported problem: a blocked attempt consumes a number and hides the fact that no review happened.

### Refresh the same round instead of opening a void round

`resume` on an unreported or blocked attempt makes no new entry in `rounds`. It updates the existing entry's `objectHash`, `artifactHash`, `artifactFiles`, `brief` and `startedAt` in place. The next normal round number comes from `rounds.length`, so it does not advance. This keeps the round number and the record layout stable and leaves finding ids (`R<round>-NN`) unchanged.

Alternative: keep the blocked report and add the next entry with a "does not count" flag. Rejected because it splits the displayed round number from the stored index and touches every round resolver, report validator and finding reference.

### The replaced attempt is archived under the round

Before refreshing, the current attempt is copied to `round-N/revisions/MM/`:

- `brief.md`: the previous brief bytes.
- `report.json`: the previous report when one exists.
- `meta.json`: the revision number, object hash, artifact hash, artifact files, cause (`object-changed` or `blocked-report`), optional stale hashes, optional notice and archive time.

The record's `rounds[i].revisions` array carries the same facts, with the brief and report reduced to `{ path, sha256, bytes, verdict?, recordedAt? }` pointers. `MM` is the 1-based revision count padded to two digits. The current round keeps only the current attempt's brief and report pointers; after archiving a blocked report, `round.report` and `round.verdict` are removed so no consumer mistakes it for a conclusion.

`staleNotice` stays the latest notice for submission bookkeeping, and every notice is also recorded in `rounds[i].notices` and the revision's `meta.json`. The watch compares the latest notice's `to` hash with the current hash, so a refreshed version gets a new notice while the same version does not.

### A blocked draft report does not enter the finding lifecycle

A blocked report can carry findings when the reviewer could not review, but those findings describe an attempt, not the artifacts. `submitReport` keeps the report file and skips `record.findings` updates for a draft `blocked` report. Archiving therefore leaves recorded findings and their statuses untouched. Apply review keeps its current behavior.

Alternative: keep blocked findings in the lifecycle. Rejected because a refreshed attempt would inherit findings from a version that no longer exists and readiness would gate on them.

### Readiness and next actions read the latest attempt

`draftReadiness` treats a latest `blocked` report as `no review report has been recorded`. Its `nextAction` logic becomes:

- substantive report and ready: unchanged;
- unreported or blocked attempt: `openspec_review action=resume review=draft` when the object differs or a report exists (blocked), and the round's `wait`/`self-report` action when the object is unchanged and no report exists;
- open finding: `dispose` as before.

`openspec_apply_next` still requires a `pass` report and the matching hash.

### The reviewer is woken for a refresh

A refresh reuses the same slot and sends a wake message naming the same round with the new brief hash. The message tells the reviewer to read the brief again. An unchanged unreported round keeps the existing no-wakeup rule. `replace` remains the only route to a new reviewer.

### Status exposes revision summaries

`openspec_review` results add an optional `revisions` array derived from every round's `revisions` entries: round, revision, object hash, cause, archive time, brief path and optional report path plus verdict. The archived bodies stay on disk; the summary only allows finding them. The output schema declares the array as optional.

### Compatibility

`readReview` and the projections use `Array.isArray(round.revisions) ? round.revisions : []`. Records written before this change have no `revisions` and behave as before until their next resume, which archives the then-current attempt.

## Risks / Trade-offs

- [A reviewer may have read the previous brief before resume refreshes the round] → The wake message names the new brief; a submit while the object differs is already restricted to `blocked`, so stale content cannot be stored as a pass. The refreshed brief and the archived one are both readable.
- [Blocked findings are no longer recorded as findings] → The report file keeps them and the revision names it. The brief states that a blocked report records an unreviewed attempt, not conclusions.
- [The same round number now covers several attempts] → `revisions` and the status summary make the attempts explicit; documentation states the numbering rule.
- [The audit grows without a bound] → The review already has no round cap; revisions are small text files and the user asked for complete audit. No pruning is introduced.
- [Status output grows] → The array is optional and summaries are short; the full reports remain on disk.

## Migration Plan

No record migration. Existing records without `revisions` stay valid, and the next draft resume archives the current attempt before refreshing. Rolling back is a code revert: the extra `round-N/revisions/` files are inert and an existing record that already has `revisions` remains readable because the field is additive.

## Open Questions

None. The requested behavior covers every `blocked` attempt that produced no substantive report, keeps the audit, and leaves apply review unchanged.
