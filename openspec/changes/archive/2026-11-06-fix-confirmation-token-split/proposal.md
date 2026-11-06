# Correct the confirmation token split

## Why

The current split subtracts every token from a round triggered by a confirmation message, but those rounds usually do the work the confirmation authorized. In the first pilot the policy official run was reported as 5.77M "core" tokens against 7.48M total, even though the confirmation round performed the implementation. The metric understates work and overstates confirmation overhead.

## What Changes

- Record per-step usage and whether the step called a tool in each session turn.
- Define confirmation acknowledgment as the steps before the first tool call in a confirmation round; a round that starts with a tool call has zero acknowledgment.
- Report total tokens, work tokens (total minus confirmation acknowledgment), confirmation-round tokens and confirmation-acknowledgment tokens separately.
- Compare arms on work tokens; stop subtracting whole confirmation rounds.
- Update the aggregate fields, Markdown columns, JSON schema, tests and `eval/README.md`.

## Capabilities

**New Capabilities**

- None.

**Modified Capabilities**

- `evaluation-harness` — the token-accounting requirement now defines the step-level split.

## Impact

- Changed: `eval/lib/session.mjs`, `eval/lib/metrics.mjs`, `eval/lib/report.mjs`, their tests and `eval/README.md`.
- Not changed: plugin runtime, fixtures, the runner and the flow driver.
- Report JSON: `tokens.core` is replaced by `tokens.work`; `tokens.confirmation` is split into `confirmationRounds` and `confirmationAck`. Old run records are not migrated.
