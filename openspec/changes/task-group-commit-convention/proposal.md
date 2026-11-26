# Proposal: Task-group commits in apply

## Why

The history does not map onto `tasks.md`. The repository commits the implementation once before the apply review, and splits only review fixes by finding, so a numbered task group with several subtasks lands as one undifferentiated commit or an arbitrary split. A reviewer cannot read the implementation group by group, and a reader of `git log` cannot tell which commit implements which group.

## What Changes

- `openspec/config.yaml` gains `operations.apply.guidance`: each numbered top-level `tasks.md` group that changes files owns a commit carrying only that group's changes, so no commit combines two groups; the subtasks of one group may share a commit; a group that only verifies leaves none.
- `AGENTS.md` states the rule in its `Commit conventions` section, including that it covers implementation commits before the first apply review while an apply review round keeps one finding per commit, and that no script or CI check enforces it. The `git log <base>..HEAD` read is split so the first apply review checks every changing group while resuming a round and land keep the one-finding check.
- `CONTRIBUTING.md` states the group rule to an external contributor — its own commit per changing group, the subtask allowance, the verification-only exemption — and that no CI check enforces it.
- The `development-workflow` and `contributor-workflow` capabilities gain requirements recording the convention and its three documentation surfaces.
- No plugin code, packaged skill, hook, test or script changes, and no existing history is rewritten. This is a repository development convention, deliberately without a mechanical gate.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `development-workflow`: add the task-group commit requirement, including its `AGENTS.md` and `openspec/config.yaml` surfaces.
- `contributor-workflow`: add the requirement that `CONTRIBUTING.md` states the convention.

## Impact

- `openspec/config.yaml`: the commented `operations` example becomes a real `operations.apply.guidance` entry.
- `AGENTS.md`: the `Commit conventions` section and the log-read sentence.
- `CONTRIBUTING.md`: the `Change-first workflow` step that implements the change.
- `openspec/specs/development-workflow/spec.md` and `openspec/specs/contributor-workflow/spec.md`: the two deltas merge there at archive.
- No plugin source, shipped skill, test, hook, CI workflow or review record changes; the change directory adds the proposal, design, deltas and tasks.
