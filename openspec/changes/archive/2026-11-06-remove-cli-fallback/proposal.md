# Proposal: Remove the CLI fallback promise

## Why

The plugin runs only its own bundled `@fission-ai/openspec` 1.16.0 and rejects `cliPath`, every `PATH` lookup and every project-local lookup. The scoped policy, the seven shipped skills, two specs and one test still tell the agent to fall back to the `openspec` CLI when a tool is missing. The plugin does not provide that path, and the instruction points the agent at a CLI version no version gate has checked.

## What Changes

- Remove the fallback sentence from `POLICY_TEXT` in `lib/policy.js`; the policy states that a missing tool is reported, not worked around.
- Remove the fallback sentence from all seven `skills/*/SKILL.md` files and state that the plugin provides no CLI fallback.
- Reverse the `skill-adaptation` requirement: skills use the tools and report a missing tool instead of permitting a CLI fallback.
- Reverse the `skill-documentation` requirement: skills state that no CLI fallback exists, and the capability purpose is updated to match.
- Reverse the skill test assertion: a packaged skill must state that no CLI fallback exists and must not contain a fallback instruction. Add the same guard for the policy text.
- Keep the remaining CLI mentions that describe a capability boundary, not a fallback: the bundled CLI's `spec-driven` schema and the `update` command distinction.

**BREAKING** for agent behavior: a skill loaded without the plugin tools now tells the agent to report the missing tool instead of running the CLI.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `skill-adaptation`: replaces "Skills prefer tools and fall back to CLI" with "Skills use tools and report missing tools".
- `skill-documentation`: replaces "Skills keep a prose fallback" with "Skills state no CLI fallback".

## Impact

- `lib/policy.js` (`POLICY_TEXT`).
- `skills/openspec-explore`, `openspec-propose`, `openspec-apply-change`, `openspec-archive-change`, `openspec-sync-specs`, `openspec-update-change`, `openspec-flow` (`SKILL.md`).
- `openspec/specs/skill-adaptation/spec.md` and `openspec/specs/skill-documentation/spec.md` (merged at archive; the purpose is edited directly).
- `test/skills.test.mjs`.
- `.dsh/skills/openspec-*` after the next `openspec_init`.
- No tool schema, runtime command resolution or CLI version change.
