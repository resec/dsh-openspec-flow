# Design: Block stale draft rounds

## Context

See `proposal.md` - Why. Three facts shape the approach.

The draft object is computed from the files on disk (`draftObject`), and the review record already stores that hash per round. Every existing entry point recomputes it: `resume`, `status`, `wait` and the reviewer `submit`. Nothing today makes an edit during a round visible before a submit, and the rebind branch of `draftReviewEntry` treats "no report" as "the reviewer is still working".

The reviewer is a separate subagent session driven only through `openspec_reviewer`. The plugin can message it only through the subagent service, and the reviewer's turn may be over at any moment; a message to an idle reviewer starts a new turn.

The review record lives in the common git directory, so a writable `review.json` is shared by every process and worktree. The process-local deadline registry in `lib/review/wakeup.js` is the precedent for a module-level registry shared by both plugin entries.

## Goals / Non-Goals

**Goals**

- Make "the artifacts changed during the round" a recorded outcome, never a silent rebind or an accepted report about unread content.
- Keep the recovery deterministic without a human: `resume` closes the stale round and opens a fresh one that wakes the reviewer.
- Notify the reviewer early so it stops instead of reviewing content the round will not credit.
- Tell the changer before it edits, and tell it what to do after a block.

**Non-Goals**

- Fixing the wait deadline's "reviewer not live" skip; a stale round no longer needs the deadline to recover.
- The apply review's rebind branch. The apply object is the committed tree and a moved head is handled by the rebase extra-round mechanism; this change leaves it untouched.
- Blocking edits. The plugin cannot intercept a file write; the rule and the watch are advisory.
- Replacing the reviewer on a blocked round. A stale block keeps the same reviewer; `resume` wakes it.

## Decisions

**The stale close writes a real blocked report.** Alternative: mark the round with a `stale: true` flag and skip the report. A report travels through `submitReport`, so the round's report pointer, the readiness projection and the submit wakeup all keep working; the verdict is what the changer sees. The record already supports `blocked` with no findings.

**The stale close is not validated against recorded findings.** A report normally must verify every `fixed` finding, and the ordinary state after a disposal is exactly "one finding fixed, awaiting the next round". That validation would refuse the very report the recovery needs, so the close validates the report shape against an empty finding set and leaves the recorded findings untouched; the round that follows carries the verification. The reviewer's stale blocked submit takes the same path.

**`resume` is the authority, the reviewer's blocked submit is the fast path.** Both write the same report on the same round, guarded by `latest.report !== undefined`, so the second one is refused and nothing is duplicated. `resume` must work even if the reviewer is gone (that is the six-hour case), so the close lives in `draftReviewEntry`, not in the reviewer tool.

**Stale metadata lives on the round.** `blockedReason: "stale-object"`, `staleFrom` (the round hash) and `staleTo` (the current hash) sit beside `report`. Alternatives: a separate file (more moving parts, not atomic with the record) or status only (not diagnosable). The fields are optional, so older records stay readable.

**The watch is advisory and deduplicated per round in the record.** It writes `record.staleNotice = {round, from, to, at}` under the review lock and sends one reviewer message. The dedupe compares the notice's `round` with the open round, so a later round that goes stale sends its own notice, and the record survives a process restart. The notice write is best-effort: a lock held by a concurrent `resume` logs a warning and skips, because the resume path closes the round anyway. The in-memory registry is per `directory` and review kind, so repeated arms replace rather than stack. The watch never writes a report; that keeps "who reported" honest.

**The watch is injectable.** `lib/review/watch.js` takes a `watch` factory (default: `fs.watch(dir, {recursive: true})`) and a debounce timer, so tests drive the stale path with a fake instead of sleeping on inotify. Arm failures are caught and logged; a review must not fail because a filesystem watch did not start.

**The reviewer message goes through the changer agent.** The subagent service addresses a child by its parent, and the record stores the changer session id. A timer has no live call context, so the callback resolves the changer with `agents.get(record.changerSessionId)` and skips the message with a warning when it is gone; the `resume` path remains the recovery.

**The stale reason and next action come from readiness.** The existing `the change artifacts changed since the review started` reason stays. Readiness already returns `openspec_review action=resume review=draft` for an unreported round whose object moved; this change makes that action safe, because resume now closes the round instead of rebinding it, and a regression test pins both that action and the `wait` action an unchanged round keeps. The execution-preflight reason keeps "edit the artifacts and resume review=draft" and is now consistent with that action.

**The generated policy text and the document are updated together.** The policy rule is the only always-visible instruction to the changer, and `docs/review.md` is the reference the review-documentation tests check; leaving either stale recreates the trap this change removes.

## Risks / Trade-offs

[Recursive `fs.watch` differs across platforms and filesystems] → The watch is advisory; correctness lives in `resume` and the submit path. Arm failures are logged, never fatal, and the tests inject the watcher.

[A second Host process watches the same round] → The record's `staleNotice` is written under the review lock; the second process sees it and stops before sending. At worst one redundant message.

[The notice write races a resume holding the review lock] → The notice is advisory; a refused lock logs a warning and skips, and the resume that holds the lock is closing the round anyway.

[A reviewer message to an idle subagent starts a turn that races the changer's `resume`] → The close is guarded by the report pointer; the second writer is refused. The notice names the round it was taken for, and the reviewer submits `blocked` with that `round`, so a late submission that arrives after `resume` opened the next round is refused by the round check instead of landing on a round nobody reviewed. Once a stale notice exists, a draft submit must name its round, and a late submission that names the closed round is refused by the round check. A reviewer that names the current round without reading it can still store a report there; that is indistinguishable from a lie about what it read, and the notice plus the round token keep the honest path unambiguous.

[`blocked` now has two causes] → `blockedReason` separates `stale-object` from a reviewer that could not perform the review, and the blocked report's summary states the cause in words the changer reads.

[A record written by a newer plugin is read by an older one] → The new fields are optional and unknown keys are ignored by projections; the older plugin simply cannot produce them.

## Migration Plan

No data migration. Records without `blockedReason` or `staleNotice` read as before. The behavior change applies to the next draft `resume`; in-flight rounds with a stale object close on their next `resume` exactly like new ones. Rollback is a code revert; the optional fields stay harmless in existing records.

## Open Questions

None.
