# Design: step-level confirmation split

## Context

See [proposal.md](proposal.md) for the pilot evidence. The runner labels a round `confirmation` from the user message that started it. The current metrics subtract the whole round's usage from `core`, so the work the confirmation authorized disappears from the comparison.

## Goals / Non-Goals

**Goals**

- Keep every token in the total.
- Attribute only the acknowledgment part of a confirmation round.
- Make work tokens comparable across arms.

**Non-Goals**

- No change to the flow driver, fixtures or runner.
- No estimate of the counterfactual cost of running without a confirmation.
- No migration of already-recorded run JSON.

## Decisions

### Acknowledgment ends at the first tool call

A confirmation round is a normal turn whose user message is a scripted confirmation. The model first reads that message and either replies with text or starts a tool call. The steps before the first tool call are the acknowledgment; every later step is the work the gate authorized. If the first step already calls a tool, the acknowledgment is zero. If the round has no tool call at all, the whole round is acknowledgment.

This is a rule about observable steps, not an estimate of marginal cost. It keeps the attribution reproducible from the session log.

### Three figures, one comparison

The report exposes:

- `tokens.total` — every provider-reported token in the run.
- `tokens.confirmationRounds` — all usage in rounds triggered by a confirmation; descriptive, because it includes work.
- `tokens.confirmationAck` — the per-step acknowledgment usage defined above.
- `tokens.work` — `total - confirmationAck`; the comparison metric.

Alternatives considered:

- **Subtract the whole round** — the current behavior; rejected because it removes work.
- **Drop the split entirely** — simplest, but loses the requested confirmation view.
- **Estimate marginal cost** — would need a counterfactual run or an assumed prompt delta; not observable from one session.

### Per-step detail belongs to the session summary

`summarizeSession` already folds each assistant message into a turn. It gains a step list per turn with the step number, usage and whether a tool call happened at that step. `metrics.mjs` reads the step list; no new event parsing is needed beyond collecting the `tool/call` turn/step pairs.

### Report schema changes are intentional

`tokens.core` and `tokens.confirmation` disappear. Keeping them as aliases would hide the corrected definition and let old charts read a wrong number. The report version is a lab tool, not a public API; the README records the new fields.

## Risks / Trade-offs

- **A long text-only step before a tool call is attributed to acknowledgment** → the README states the rule; the number is reproducible, not a claim about intent.
- **A confirmation round that starts with a tool call has zero acknowledgment** → this is expected; the round's tokens remain in total and work, and the round count still records the gate.
- **Old run JSON has no `work`/`ack` fields** → no migration; rerun the matrix to produce the new schema.
- **Reports become slightly wider** → keep the columns explicit and document them.

## Migration Plan

No runtime or fixture migration. Recompute any old report with `node eval/parse-session.mjs` only if the raw session and round metadata are still available; otherwise rerun. Rollback is a code revert.

## Open Questions

None.
