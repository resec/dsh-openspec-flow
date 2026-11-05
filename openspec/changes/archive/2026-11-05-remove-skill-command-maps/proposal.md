# Proposal: Remove skill command maps

## Why

The six workflow skills each end with a `## Command map` table that pairs every `openspec` CLI command with the tool that replaces it. The table has no fallback value: the thirteen tools already cover every step in those skills, and the commands outside that surface (`config`, `workset`, `view`) are not part of these workflows. It repeats roughly fifty lines across six files and puts CLI invocations back in front of the model, which conflicts with the plugin's goal of keeping the agent on the tool surface.

## What Changes

- Remove the `## Command map` section from `openspec-explore`, `openspec-propose`, `openspec-apply-change`, `openspec-archive-change`, `openspec-sync-specs` and `openspec-update-change`.
- Replace the remaining CLI command references in skill bodies with prose; keep one fallback sentence saying the CLI is used only when a tool is unavailable.
- Add test assertions that reject a packaged skill containing a command map or a fenced `openspec` command.
- Re-run `openspec_init` to sync the project's `.dsh/skills` and back up the previous text.

## Capabilities

### New Capabilities

- `skill-documentation`: what the shipped skill documents may contain, including the ban on CLI command tables and the prose fallback rule.

### Modified Capabilities

None. `skill-adaptation` is still a delta in the unarchived `complete-openspec-toolset` change, so this change introduces a separate capability instead of editing it.

## Impact

- `skills/openspec-*/SKILL.md` (six files).
- `test/skills.test.mjs`.
- `.dsh/skills/openspec-*` after the next `openspec_init`.
- No runtime code and no tool schema changes.
