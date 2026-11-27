# Proposal

## Why

`openspec/specs/skill-adaptation/spec.md` already requires two answers the shipped skills never give. A landed plugin-created worktree must be reported as already archived (`A landed worktree change is already archived`), and after the user approves `waive-reviewer` the workflow must continue (`A waived reviewer continues`). The archive skill only described the `active`, `landing` and pending-cleanup states, so a landed worktree reads as an archive candidate. The propose and apply skills described the reviewer `wait` path but never said what to do once the reviewer is waived, so the agent had to infer readiness itself.

## What Changes

- The archive skill adds an `archived`-with-no-cleanup branch next to the existing `repair.action: "cleanup"` branch: report that the change is already archived and stop, without calling `openspec_archive` or land again.
- The propose and apply skills add one sentence for the approved `waive-reviewer` call: follow the returned `nextAction` only when it names another `openspec_review` action. A waiver that leaves the review ready continues with the skill's own step — present the proposal in propose, go to Finish in apply — and never calls `openspec_apply_next`.
- `test/skills.test.mjs` asserts the `already archived` and no-retry phrases, the scoped `nextAction` sentence and `approvedBy: "user"` in each review skill.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The `skill-adaptation` spec already carries both scenarios; only the skill text was missing them, so this change sets `skip_specs: true`.

## Impact

- `skills/openspec-archive-change/SKILL.md`, `skills/openspec-propose/SKILL.md`, `skills/openspec-apply-change/SKILL.md`: one branch and one scoped waiver sentence each.
- `test/skills.test.mjs`: one new test with the two phrase assertions.
- No tool, policy text, payload, dependency, hook, coverage-baseline or `dist/` change.
