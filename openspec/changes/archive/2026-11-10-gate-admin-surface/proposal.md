# Proposal: gate-admin-surface

## Why

Every tool the plugin registers is sent to the model on every request. The 13 tool schemas total 8,489 characters (about 2,400 tokens), and 1,014 more characters carry the five skill catalog entries. Three of those tools — `openspec_init`, `openspec_store_list` and `openspec_schemas` — serve management work that a normal change flow never touches: `init` appears only when a project is not set up, `store_list` is referenced by no skill, and `schemas` answers one rare exploration question. The management surface is expected to grow as the plugin covers more of the OpenSpec CLI (store registration, workset views, schema operations, configuration). Paying for it on every request gets worse as that surface grows.

## What Changes

- Split the agent-facing surface into two blocks. The core change flow keeps the 10 tools the five shipped skills call (list, status, show, context, instructions, new_change, validate, apply_next, mark_task_done, archive) and all five packaged skills; it stays exposed.
- The management block (`openspec_init`, `openspec_store_list`, `openspec_schemas`) is closed by default and exposed only while open.
- Add a user command `/opsx-admin [intent]` that opens the management block for the current turn, and `/opsx-admin off` that closes it early. The block closes when the agent returns to idle. The model has no way to open it.
- Move `openspec_schemas` out of the exploration skill's normal path. The shipped skills ask the agent to request `/opsx-admin` when a management tool is needed, instead of reporting a missing tool.
- State the two blocks and the command in the flow policy.
- Keep all five packaged skills in the core block; no skill is gated by this change.

**BREAKING** `openspec_init`, `openspec_store_list` and `openspec_schemas` are no longer callable without opening the management block first. A caller or prompt that expects them to be always available must run `/opsx-admin`.

## Capabilities

### Modified Capabilities

- `tool-surface`: tool exposure becomes block-based, and the management tools are gated by a user command.
- `flow-policy`: the standing flow rule names the management block and the command that opens it.
- `skill-provider`: the five packaged skills belong to the core block and are not affected by the gate.
- `skill-adaptation`: the shipped skills route gated tools through `/opsx-admin` instead of treating them as missing.
- `skill-documentation`: the "unavailable means report and stop" rule is amended for tools that are deliberately gated.

## Impact

- `lib/tools/index.js`, `lib/tools/query.js`, `lib/init.js`: registration gains the step-time activation condition for the three management tools.
- New `lib/admin.js` for the block state and the `/opsx-admin` command; `index.js` wires it when the host exposes a command registry.
- `lib/policy.js`: the policy text states the gate.
- `skills/openspec-explore/SKILL.md`, `skills/openspec-propose/SKILL.md`, `skills/openspec-apply-change/SKILL.md`: gated-tool instructions.
- `README.md`: the tool tables and a new command section.
- Tests: new coverage for the gate; existing registration tests updated.
- No dependency or CLI-version change. The management block stays closed across resume because it is never persisted.
