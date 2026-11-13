# Design: reviewer preset

## Context

See `proposal.md` — Why. Draft and apply review already own the record, report, finding and readiness contracts. This change replaces the self-review slot with one managed child for `reviewers: 1`.

## Decisions

### One activation, caller delivery

`openspec_review start` calls `ctx.subagents.startActivation({ provider: 'spawn', delivery: 'caller', request: { parent: exec.agent, cwd, prompt, agentPreset: 'openspec-reviewer' } })`. Caller delivery suppresses the parent completion notice; the record stores the child id and slot state. The changer uses `wait` rather than the runtime notice.

### The reviewer writes its own report

`openspec_reviewer submit` verifies that the calling agent's id is the recorded slot child, then writes the report through the same validator and record update used by self-review. A shared `submitReport` function keeps both paths identical.

### Wait polls the record

`wait` checks the record every 250 ms until a report, a waiver or the per-round deadline. It returns `waiting` after a 90-second segment, so a long review does not depend on one tool timeout. The next `wait` continues.

### Preset is a separate subpath plugin

The `openspec-reviewer` preset composes `@deepseek-ai/dsh-tool-fs` (read only), `@deepseek-ai/dsh-tool-fs-search` and `dsh-openspec-flow/reviewer`. The subpath entry registers only `openspec_reviewer`, so the changer never sees that tool. The preset excludes bash, write, edit, subagent, workflow and `openspec_review`.

### Retry, replace and waiver are slot operations

`retry` messages the same child, `replace` starts a new activation and records the reason, and `waive-reviewer` requires `approvedBy: user` and marks `reviewerWaived`. Readiness treats a waiver as a coverage gap: it skips the missing-report check but keeps object-hash, finding and verdict checks.

### Reviewer model inherits the changer

This change does not add model selection. The activation omits `agentOptions`, so the spawn provider inherits the changer's route. The configuration page change adds explicit model selection.

## Risks

- A reviewer that exits without submitting leaves the slot pending; `wait` reaches `overdue` and the user must retry, replace or waive.
- The preset is only as read-only as its tool list and the parent sandbox; it is not a separate permission sandbox.
- A child id is process-local; after a plugin restart the record can only be resumed through `sendMessage` or replacement.

## Migration

Existing records use `reviewers: 0` and the self path. The new path is opt-in per change policy. A change that cannot start a reviewer fails closed rather than silently self-reviewing.
