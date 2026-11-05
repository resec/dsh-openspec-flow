# Proposal

## Why

The installed plugin only registers apply tools and one skill. Whether a session follows the OpenSpec workflow therefore depends on which skill description the model matches in that turn; nothing in the plugin states the workflow as a standing rule. The user wants that rule present in every OpenSpec project session without changing the system prompt of projects that do not use OpenSpec.

## What Changes

- Add an agent-scoped system prompt section that states the OpenSpec stage gates: clarify before proposing, confirm before creating a change, apply through `openspec_apply_next` / `openspec_mark_task_done`, validate before reporting completion, and archive only on an explicit user request.
- Injected only while the agent's current directory contains an `openspec/` root; other projects receive no section at all.
- The section text is evaluated at every prompt assembly, so it follows a working-directory change and disappears when the agent leaves an OpenSpec project.
- Register for agents created after the plugin loads, and attach to agents that already exist at load time.
- No tool gate or write restriction in this change; the section is advisory and leaves existing tool behavior unchanged.
- Document the new behavior in the README, project instructions, and the shipped skill.

## Capabilities

### New Capabilities

- `flow-policy`: the plugin contributes a standing OpenSpec workflow rule to an agent's system prompt, scoped to projects that contain an OpenSpec root.

### Modified Capabilities

None.

## Impact

- Code: new `lib/policy.js`; `index.js` gains `agents` and `systemPrompt` injection and one registration call.
- Tests: new `test/policy.test.mjs`; `test/fake-context.mjs` gains the members policy registration reads.
- Docs: `README.md`, `AGENTS.md`, `skills/openspec-flow/SKILL.md`.
- Runtime: OpenSpec-project agents gain a short prompt section; agents in other projects are unchanged. Existing tools, schemas, and outputs are untouched.
