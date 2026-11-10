# Design: align skill spec reads

## Context

See `proposal.md` — Why. The implementation surface is two packaged skill documents; the plugin has no runtime code path for this behavior. Skill bodies are read only when a skill is selected, while descriptions stay in the catalog.

## Goals / Non-Goals

Goals:

- Fix the read order in `openspec-propose`: setup check, capability inventory, filtered overview, full read, conflict surfaced.
- Fix the read order in `openspec-explore`: filtered overview first, then a full read of every relevant spec including scenarios.
- Lock both requirements with assertions over the packaged documents.

Non-Goals:

- Change `lib/policy.js`, which stays a minimum gate.
- Add the `config.yaml` read, dependency re-reads, or codebase inspection from the official templates.
- Change the package version, skill frontmatter, tool surface or CLI pin.

## Decisions

- Put the read rules in the skills, not the policy. The policy is always loaded for every OpenSpec project; the detailed read order belongs to the two workflows that use it, and the skill provider already loads bodies on demand.
- Name tools, never CLI commands. `test/skills.test.mjs` rejects CLI tokens and bare `openspec` commands, and `openspec_instructions` already rewrites the official commands into tool names.
- Order the propose reads so a missing project setup is resolved first: `openspec_list` for the setup check, then `openspec_list` with `specs: true`, then a filtered `openspec_show`, then a full `openspec_show` per relevant capability.
- Assert key phrases rather than a full snapshot. A snapshot would fail on every wording edit; the phrases cover the behavior the spec requires.
- Keep the assertions in `test/skills.test.mjs`, beside the existing packaged-skill scan, instead of adding another test file.
- Change only the two README comparison rows; the rest of the table and the tool-surface documentation stay as they are.

## Risks / Trade-offs

- [The rules do not apply until a skill is loaded] → Keep the frontmatter description unchanged so the skill stays discoverable; do not claim enforcement.
- [A full read can be expensive] → Keep the `relevant` qualifier and the "read only what the question needs" bound; the filtered overview comes first.
- [Remaining distance from the official templates] → The Non-Goals record it; `config.yaml`, dependency re-reads and codebase inspection can be a separate change.
- [Tests couple to wording] → Assert only the key phrases, so wording edits stay cheap.
- [README has uncommitted edits from another change] → Apply reads the current file and touches only the two comparison rows.

## Migration Plan

No runtime migration. The new text takes effect when the plugin reloads its skills; the README update ships with the skill text.

## Open Questions

None.
