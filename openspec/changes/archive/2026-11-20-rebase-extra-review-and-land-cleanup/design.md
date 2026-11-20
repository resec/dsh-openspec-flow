# Design: Rebase extra review rounds and land cleanup

## Context

See `proposal.md` — Why. The apply review record lives in the shared review directory and currently models rounds as one `rounds` array whose length drives the round number. Findings carry `firstRound` and `verifiedInRound` with a numeric comparison in readiness, and report ids must match `R<round>-NN`. Land runs under the lifecycle and change locks, writes the archived state and manifest, then releases the locks; it never removes the worktree or branch. The worktree state is validated against a fixed field list, so a new field must be admitted explicitly. Inspection derives `repair` from state, locks and the worktree path. Two unlanded changes in this repository already show the stale checkout problem: their state is `archived` while the worktree and branch remain.

## Goals / Non-Goals

Goals:

- Keep the normal round number stable across a rebase recovery review.
- Keep one report, finding, disposition and wakeup contract for both round kinds.
- Make land self-cleaning and idempotent when cleanup fails.
- Keep old records and old state files readable without forward migration.

Non-Goals:

- No remote branch or push behavior; land still does not push.
- No change to draft review round behavior.
- No automatic rebase, retest or commit; the changer performs those steps.

## Decisions

### Rebase marker lives on the apply review record, written under the review lock

Land writes `rebaseReview` into `apply-review.json` rather than into the worktree state. The review record already owns round decisions, resume reads it, and the review directory is shared across worktrees. Land writes it only after the change-lock owner check and under the review-directory lock, because the main review requirement serializes every record mutation with that lock; the atomic rename alone is not the lock. Land does not need the lifecycle lock for the marker write.

Alternatives: a state flag would require review code to read and validate the worktree state. A git ref or file beside the worktree would add another artifact to clean up.

### Extra rounds are a separate array with `E<n>` tokens

`extraRounds` mirrors the normal round entry shape and uses `round: "E1"`. Both kinds carry a numeric `seq` from one counter, so finding verification compares one sequence regardless of token ordering. The normal `rounds` array and its length are untouched, so every existing `rounds.length + 1` assumption stays correct. Findings keep numeric `firstRound`/`verifiedInRound` for comparison and record optional `firstRoundToken`/`verifiedInRoundToken` for reports and display.

Alternatives: marking entries inside `rounds` with `special: true` would break the length-to-number mapping everywhere. A string-only round number would force a larger rewrite of readiness and submission.

### The marker survives a ready extra round and land clears it at the end

A ready extra round does not clear `rebaseReview`; otherwise land could no longer find the reviewed tree, because the record-level `treeSha` and `objectHash` still describe the pre-rebase tree. Resume against a ready extra round returns the recorded brief without opening another round. Land binds the extra round's `treeSha` as the required tree, runs the merge, archive and `finishLand`, and only then clears the marker under the review-directory lock at the end of the critical section. Clearing after the manifest and archived state means an archive, archive-commit or manifest failure leaves the marker in place, so the resumable land retry still resolves the extra round tree. The manifest's `reviewRecordHash` is the hash of the bytes `finishLand` read before the clear; a later audit treats it as the land-time record hash and does not recompute it from the post-clear record. The only early clear is the unchanged-tree fast path: when the rebased `HEAD^{tree}` equals the marker's reviewed tree, resume clears the marker and returns the recorded brief without opening a round.

Alternatives: promoting the extra round's tree and hash to the record-level fields would make land work after an early clear, but it would silently change the meaning of the normal record fields and every consumer reading them. Clearing after `assertMergedTree` was rejected because the archive and manifest can still fail and strand the retry.

### Round arguments accept both number and token

The `round` parameter becomes `anyOf: [integer, "E<n>"]` on `openspec_review` and `openspec_reviewer`. Draft review rejects an `E` token. Apply review resolves it through one shared helper used by resume, self-report, report, dispose, waive, extend, the reviewer brief/status/findings/own-report reads and the reviewer submit. `status` does not require or use a round argument because it already reports every extra round. Existing integer calls are unchanged.

### Results keep a numeric round and add a token

The `openspec_review` output schema keeps `round` as the latest normal round and adds `roundToken` and `extraRounds`, declared in the closed schema so Host validation accepts every extra-round result. `roundToken` is present only for an extra round and omitted for a normal round, so the field has one unambiguous meaning. The reviewer output schema declares the same current-round token and an extra round history entry token. This keeps existing clients working and satisfies the closed-schema validation the fake Host does not enforce.

### Cards use the shared sequence and carry the token

An extra round card uses `seq` for the file name, top-level `round` and payload `round`, and adds `roundToken` to the payload. The card reader keeps its integer check, `buildCard` resolves `extraRounds`, and ordering keeps its numeric subtraction. The collapsed and expanded summary render `roundToken` when present, so the user sees `E1` rather than the sequence. This preserves the card endpoint, watermark and ordering behavior without teaching them a second number space.

### Land required tree resolves in one order

1. `rebaseReview` present and the latest extra round is ready: use the extra round's `treeSha`.
2. `rebaseReview` present and the rebased `HEAD^{tree}` equals the marker's reviewed tree: resume clears the marker and uses that tree.
3. `rebaseReview` present otherwise: refuse and name `openspec_review action=resume review=apply`.
4. No marker: current behavior (ready apply review tree, or worktree head when apply review is disabled).

### Cleanup runs inside the lifecycle section and never rolls back a completed land

After `finishLand` writes the manifest and the archived state, land calls one cleanup routine: `git worktree remove --force`, then `git branch -d`. The state is updated with `cleanup.worktreeRemoved`, `branchRemoved` and `at`; a failure stores `cleanup.error` and returns `cleanup.complete: false` with that error instead of throwing. The merge, archive, manifest and archived state stay valid.

### A cleanup retry branches before every merge precondition

The land entry inspects the state first. When the state is `archived`, the manifest exists and cleanup is incomplete, land takes the retry branch: it acquires the lifecycle lock and the change lock, runs only the cleanup, keeps `archived`, and returns the same result shape. This branch runs before the lock handover, worktree reads and clean or behind-main checks, because the archived state has null locks and its worktree may already be gone. An already removed worktree or branch counts as success.

Alternatives: deleting the state file would drop the land record the manifest audit depends on; rolling back a landed merge would be unsafe. A separate cleanup action would grow the tool surface for one internal step.

### Inspection understands a cleaned state

The doctor reports `repair.action: "none"` for an archived state whose `cleanup.worktreeRemoved` is true, and `repair.action: "cleanup"` when the state is archived but cleanup is incomplete. A legacy archived state without `cleanup` whose worktree still exists is also pending cleanup, which is what the two stale checkouts in this repository need. A missing worktree without a cleanup record stays `manual`. The state validator admits `cleanup` as an optional object and keeps rejecting unknown fields.

### `remove` stays for legacy and abandoned checkouts and is idempotent after cleanup

Land no longer calls `remove`. `remove` keeps its existing behavior for archived checkouts that predate cleanup, and for a state whose cleanup already ran it succeeds without deleting the state or failing because the checkout or branch is gone. This avoids two owners for the same state file.

## Risks / Trade-offs

- [Wider review surface] Extra rounds touch brief rendering, report validation, readiness, submission, cards, the reviewer tool and wakeup. → One shared round resolver and one shared readiness path; tests cover a normal round after an extra round.
- [Finding sequence] Numeric `firstRound`/`verifiedInRound` plus tokens adds a field pair. → Tokens are optional on old records; the numeric path stays authoritative.
- [Cleanup partial failure] Worktree removed but branch deletion fails, or vice versa. → Each flag is independent and a retry only completes the missing step.
- [Land entry widening] Land accepts an archived state only for cleanup retries. → The retry branch checks the manifest and incomplete cleanup before any handover or merge code, so a completed land cannot merge twice.
- [Inspection status] New `cleanup` repair action may surprise clients that enumerate the enum. → The output schema adds the value; older clients see a valid string.
- [Legacy stale checkouts] An archived state without `cleanup` whose worktree still exists now reports `cleanup`, so the doctor asks for a land retry instead of a manual repair. → This is the intended recovery for the two existing checkouts; the docs state the retry command.

## Migration Plan

No forward migration. Old `apply-review.json` files lack `extraRounds` and `rebaseReview` and read as absent. Old state files lack `cleanup` and read as absent. Old tool calls passing an integer round keep working. A rollback must delete `cleanup` from state files written by this release, because the older reader rejects unknown state fields; review records and cards need no cleanup because the old reader ignores fields it does not know.

## Open Questions

None.
