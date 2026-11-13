# Add draft review

## Why

The plugin currently moves from planning artifacts straight to apply. Nothing records that the proposal, delta specs, design and tasks agree with each other, match the user's request, or avoid conflicts with the main specs. A reviewer is also absent from the workflow, so there is no independent check before implementation starts.

## What Changes

- Add a change-scoped draft review record under `openspec/.review/<store>#<change>/`.
- Lock the review policy when a change is created; later settings changes do not alter an existing change.
- Add `openspec_review` with draft-review actions: `start`, `status`, `self-report`, `report`, `dispose`, `waive`, `extend` and `abandon`.
- Add self-review (`reviewers: 0`): the changer writes the review report; no reviewer subagent yet.
- Define draft findings, severity, finding lifecycle, verdict and the `ready` calculation.
- Gate `openspec_apply_next` on a ready draft review, and record the apply base commit when the review is ready.
- Add the draft review gate to the scoped flow rule and the propose skill.
- Keep independent reviewer subagents, apply review, the reviewer preset and the configuration page for later changes.

## Capabilities

### New Capabilities

- `change-review`: the change-scoped review record, draft review object, policy lock, self-review report, findings lifecycle, verdict, readiness and the apply gate.

### Modified Capabilities

- `tool-surface`: add `openspec_review` and gate `openspec_apply_next`.
- `flow-policy`: the scoped flow rule states the draft review gate and the commit-free draft object.
- `skill-adaptation`: the propose skill runs the draft review before presenting the proposal.

## Impact

- `index.js`: review config and conditional tool registration.
- `lib/tools/`: `openspec_review`, the `openspec_apply_next` gate and `openspec_new_change` policy locking.
- `lib/review/`: review store, policy, artifact hash, brief, report validation and readiness.
- `lib/policy.js` and `skills/openspec-propose/SKILL.md`: workflow text.
- `README.md`: tool and configuration notes.
- Tests: fake Host context, real bundled OpenSpec CLI, review store and gate regressions.
- No CLI, dependency or schema change.
