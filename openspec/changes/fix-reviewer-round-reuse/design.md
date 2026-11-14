# Design: reuse the reviewer across rounds

## Context

See `proposal.md` for the evidence. The previous change added a fresh-activation branch to `startReview` and `startApplyReview` and changed the main `change-review` spec. The original contract, the `retry` action and this session's recovery all use one reviewer per review: `retry` calls `subagents.sendMessage` on the slot's agent, and the reviewer tool reads the latest round's brief. `replace` is the explicit way to start a new reviewer.

## Goals

- Wake the existing reviewer on every new draft or apply round.
- Keep the same slot agent across rounds; do not append replacement history.
- Do not wake again when resuming a round that has no report.
- Preserve the first-round activation and the manual `retry`/`replace` semantics.
- Remove the incorrect main-spec requirement and replace it with the reuse contract.

## Non-Goals

- Changing the reviewer preset, model resolution, wait limits or round limits.
- Changing `retry`, `replace` or `waive-reviewer`.
- Migrating existing review records.
- Changing the draft or apply object hashes.

## Decisions

### Wake the slot agent instead of starting a new reviewer

The start path uses `subagents.sendMessage` on `slot.agentId` with a message naming the new round and asking the reviewer to read the current brief and submit. It keeps the slot's `agentId`, sets `state: pending`, `round` and `lastWokenAt`, and leaves `replacements` untouched. This is the same transport the manual `retry` uses, with a round message instead of a retry message.

Alternative: keep the fresh activation added by the previous change. It contradicts "exactly one reviewer", loses the reviewer's memory of its prior findings, leaves orphan child sessions, and makes `replace` redundant. The session history shows the same reviewer submitted rounds 2 and 3 after a wake.

### Use the report-presence branch to decide whether to wake

The start paths already distinguish a new round (the latest round has a report) from resuming an unreported round. Wake only in the new-round branch when a slot exists; on resume, do nothing; when no slot exists, activate once. This avoids duplicate messages on repeated `start` calls.

### Keep `retry` and `replace` unchanged

`retry` remains the manual fallback that increments `retries`; `replace` remains the only way to start a new reviewer. A round wake is not a retry, so it does not increment `retries`; `lastWokenAt` records the wake. `waive-reviewer` still suppresses the report requirement.

### Replace the bad requirement through REMOVED + ADDED

The incorrect "Each review round activates its reviewer" is now in the main spec, so the delta removes it with a reason and migration, then adds "Each review round wakes the reviewer". A MODIFIED block would have to keep the old scenario names and invert their meaning; removal is clearer and leaves the main spec with one coherent contract.

## Risks / Trade-offs

- **The slot reviewer child is gone** → `sendMessage` fails and names the failure; the user can `replace`. The fresh-activation approach masked this, but it also silently changed the reviewer.
- **A stale slot from the previous change** → The slot's current agent is woken; if that child is gone, the same explicit failure applies and `replace` repairs it.
- **A wake arrives while the reviewer is still processing** → A new round is only created after the previous report, so the reviewer should be idle; the message is queued by the subagent service otherwise.
- **`retries` no longer resets per round** → It remains the manual retry count; `lastWokenAt` and `round` carry the round history.

## Migration Plan

1. Existing records keep their slot; the next new round wakes its current agent.
2. `replacements` written by the previous change remain inert history; no rewrite is needed.
3. Rollback removes the wake branch and restores the previous behavior if the main spec is also rolled back.

## Open Questions

None.
