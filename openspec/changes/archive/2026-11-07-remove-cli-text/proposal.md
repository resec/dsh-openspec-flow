# Proposal: Remove CLI mentions from skills and tool descriptions

## Why

The plugin still runs its bundled OpenSpec CLI, but the model never uses that layer directly. The shipped skills name the CLI ten times, nine tool descriptions name it, and the scoped policy carries a "no CLI fallback" sentence. That text anchors the model on a surface it cannot use and contradicts the plugin's single-tool-surface design.

## What Changes

- Remove every CLI mention from the seven packaged skills: replace the no-fallback sentence with "if a tool is unavailable, report it and stop", drop the "run the CLI" guidance, and rewrite the two update-refresh distinctions without naming the CLI.
- Rewrite nine tool schema descriptions so they describe the data or the action without naming the CLI.
- Rewrite the scoped policy sentence the same way.
- Replace the `skill-documentation` requirement "Skills state no CLI fallback" with "Skills name only the tool surface", extend its test guard to reject the token `CLI`, and add a description scan test.
- Remove the `skill-adaptation` no-fallback requirement; the `skill-documentation` requirement now owns that behavior.
- Add a `tool-surface` requirement and a `flow-policy` requirement that their agent-facing text names no CLI.

Out of scope by request: tool return values, error messages, README and `AGENTS.md`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `skill-documentation`: replaces the no-fallback requirement with a no-CLI-mention requirement and widens the test guard.
- `skill-adaptation`: removes the duplicated no-fallback requirement.
- `tool-surface`: adds a requirement that tool descriptions name only the tool surface.
- `flow-policy`: adds a requirement that the flow rule names only the tools.

## Impact

- `skills/openspec-explore`, `openspec-propose`, `openspec-apply-change`, `openspec-archive-change`, `openspec-sync-specs`, `openspec-update-change`, `openspec-flow` (`SKILL.md`).
- `lib/tools/apply.js`, `lib/tools/query.js`, `lib/tools/shared.js`, `lib/init.js` (descriptions only).
- `lib/policy.js`.
- `openspec/specs/skill-documentation/spec.md` (purpose edited directly).
- `test/skills.test.mjs`, `test/policy.test.mjs`, new `test/descriptions.test.mjs`.
- No runtime behavior, tool schema shape, CLI resolution or return value changes.
