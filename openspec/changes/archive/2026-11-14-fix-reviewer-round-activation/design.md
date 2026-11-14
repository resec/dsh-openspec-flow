# Design: reviewer activation on later rounds

## Context

See `proposal.md` for the failure. `startReview` and `startApplyReview` share the same round-selection shape: they reuse the latest round when it has no report and otherwise append a new round, write the brief, then activate a reviewer only when `record.reviewers.slots` is empty. The reviewer tool resolves the slot by the calling child's agent id, so the slot must point at whichever child owns the current round.

## Goals

- Activate a reviewer on every new round, for draft and apply review.
- Never activate a second reviewer when resuming an unreported round.
- Record the handoff so the review history shows which agent owned which round.
- Keep the reviewer tool's slot check and the existing `replace`/`retry` actions unchanged.

## Non-Goals

- Changing the reviewer preset, the model resolution or the wait/round limits.
- Changing the `replace`, `retry`, `wait` or `abandon` action semantics.
- Migrating existing review records.
- Changing the draft or apply object hashes.

## Decisions

### Detect the new round in the same branch that selects it

Both start paths already branch on `last !== undefined && last.report === undefined`: that branch resumes a round, the other appends a new one. A local `isNewRound` flag is set in the append branch (and for a fresh record), then the activation condition becomes `policy.reviewers === 1 && (isNewRound || slots.length === 0)`. This keeps the existing no-slot repair path and adds exactly the missing case.

Alternative: compare the slot's `round` to the selected round. Older records have no `round`, so this would activate a duplicate on a resumed round. The report-presence flag reflects the actual state.

### Replace the slot's agent and record the handoff

On activation the slot keeps its `slot` id but gets the new `agentId`, `state: pending`, `startedAt`, `round`, and a replacement entry `{ from: prior.agentId, to: childId, reason: "new <kind> round <n>", at }` in `replacements`. `retries` resets because it counts attempts of the current reviewer. The reviewer tool's `requireSlot` check then rejects the old child automatically.

Alternative: keep one slot per round in an array. That changes the reviewer tool's slot resolution and the record shape more deeply; the single-slot handoff preserves the existing contract.

### Activation happens inside the review lock before the record save

A failed activation throws before `saveReview`, so the round and slot on disk stay at their previous state and a later start can retry. The brief file may already be written; it is rewritten on the retry.

### Tests use the existing fake subagent service

The external setup already returns every `startActivation` spec and creates reviewer ids `reviewer-1`, `reviewer-2`. The tests drive the reviewer tool with those agent ids to submit round 1, then start round 2 and assert a new activation, the slot handoff, no duplicate on resume, and the old agent's rejection.

## Risks / Trade-offs

- **Two concurrent starts on a new round** → The review lock serializes them; the first creates the round and activates, the second sees the latest round with no report and resumes without activating.
- **Activation fails after the brief write** → The record is not saved, so the round is retried; the orphan brief is overwritten.
- **`replacements` grows with rounds** → It is bounded by the round cap and is the audit trail the `replace` action already uses.
- **A legacy record has a slot but no `round`** → Resuming an unreported round keeps the slot (no duplicate); a new round activates and records the handoff.

## Migration Plan

1. Existing records keep their slot; the next new round appends the activation fields.
2. No stored file changes are required; the new slot fields are additive.
3. Rollback removes the activation condition and the slot fields; records remain readable.

## Open Questions

None.
