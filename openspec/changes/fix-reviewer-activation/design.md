# Design: fix reviewer activation

## Context

See `proposal.md` for the failure. The plugin calls the subagent service in `startReviewerActivation`, and the service's `startActivation` reads `spec.parent`, `spec.prompt`, `spec.agentPreset` and `spec.signal` directly. The plugin currently nests them under `request`, so the first read of `spec.parent.id` throws. The tests drive a fake service that records the argument without validating it, and assert the nested shape, so the defect is invisible to them.

## Goals

- Make the activation match the pinned service contract exactly.
- Make the tests fail if the shape regresses.

## Non-Goals

- Adding a compatibility shim that accepts both shapes; the runtime is pinned to one contract.
- Changing the reviewer preset, the locked-model check or the retry/replace paths.
- Verifying the fix in a live Host session (that needs a reload, see Risks).

## Decisions

### Flatten the activation argument instead of wrapping in `request`

The service type declares the activation as `provider`, `label`, `delivery`, `parent`, `prompt`, `cwd`, `agentPreset`, `agentOptions` and `signal` at the same level. Passing them directly is the smallest change and removes a translation layer that would drift again. A shim that detects `request` and unwraps it would keep two shapes alive and hide future contract breaks.

### Assert the contract in the integration test

The existing three assertions move from `activations[0].request.*` to the top level, and two new assertions pin the properties that broke: `activations[0].parent.id` equals the calling agent and `activations[0].request` is `undefined`. The second assertion is what fails on the old nested shape, so the regression is caught even if a future refactor renames the fields.

## Risks / Trade-offs

- **The running Host keeps the old code until reload** → The change is verified by tests; the live session is not reloaded here, and the proposal states the limitation.
- **The fake service still does not enforce the real contract** → The new assertions pin the exact fields the real service reads, which is the observable part of that contract.
- **`cwd` is optional in the service type** → The plugin passes the project root; no behavior change.

## Migration Plan

1. Flatten the call in `startReviewerActivation`.
2. Update the three assertions and add the two regression assertions.
3. Rollback restores the `request` wrapper and the old assertions; no data migration.
