# Design: Merge read tools into one inspect entry

## Context

See `proposal.md` — Why for the measured prompt cost. Two constraints shape the implementation:

- The Host projects only `name`, `description` and `parameters` to the model (`dsh-tools` `projectToolSchema`). `output.schema` is used for result validation but never enters the prompt, so a strict `oneOf` costs no prompt budget.
- The six read tools already share the same session directory lookup, the same optional `store` parameter and the same projection layer. Their execute bodies differ only in the CLI argv, the schema gate and the projection function.

## Goals / Non-Goals

**Goals**

- One model-facing read tool with six actions and no separate read registrations.
- Byte-identical response bodies for the six actions, except the two tool-reference fields in status and context.
- A strict output schema with exactly one top-level branch per action.
- Accurate CLI-to-tool mapping in the README, the packaged skills, the policy text and the instruction rewrite.

**Non-Goals**

- Merging `openspec_apply_next` (it owns the apply cache), `openspec_mark_task_done`, `openspec_new_change` or `openspec_archive`.
- Supporting custom schemas or changing the schema gate.
- Changing workflow steps, artifact instructions or the apply loop.
- Keeping the six old tool names as aliases.

## Decisions

### Action names mirror the CLI subcommands

`action` is one of `list`, `status`, `show`, `instructions`, `context`, `validate`. The names match the OpenSpec CLI subcommands, so the model's prior and the skill mapping are mechanical. `list` keeps the existing `specs: true` modifier instead of gaining a seventh `specs` action; that preserves the former tool's parameter contract and avoids an enum value that duplicates a boolean.

Alternative considered: separate `specs` action. Rejected because it breaks the `specs: true` call shape the skills already use and adds a seventh branch without adding behavior.

### Parameters stay flat; combinations are checked before the read

The parameter schema declares `action` as required, `additionalProperties: false`, and the nine former parameters flat: `store`, `specs`, `change`, `name`, `type`, `noScenarios`, `artifact`, `scope`, `strict`. A per-action table runs in `execute` before `runOpenSpec`:

| action | required | accepted |
| --- | --- | --- |
| `list` | — | `specs`, `store` |
| `status` | `change` | `store` |
| `show` | `name` | `type`, `noScenarios`, `store` |
| `instructions` | `change`, `artifact` | `store` |
| `context` | — | `store` |
| `validate` | `change` when `scope` is `change` or `spec` | `scope`, `strict`, `store` |

Errors name the action and the parameter: `action 'status' requires 'change'.` and `'artifact' is only valid for action 'instructions'.` Inputs are rejected before the CLI process starts, so a bad call has no side effect.

Alternative considered: `oneOf` parameter branches per action. Rejected because it multiplies the model-visible schema with near-duplicate field descriptions and makes the parameter block harder to read than the flat table.

### The six handlers survive as internal functions

Each `registerXTool` becomes an internal `readX(ctx, settings, args, exec)` that returns the same projection it returns today. `registerInspectTool` owns the single registration, validates the action, then dispatches to the handler. The CLI argv, schema gates and projection calls are unchanged.

Alternative considered: inline the six bodies into one switch. Rejected because it creates a large function and makes byte-equality tests harder to target.

### Tool references inside responses name inspect and carry the action

Two projection fields change because they are instructions to the model, not data:

- `projectStatus` `nextSteps`: planning incomplete becomes `{ tool: "openspec_inspect", arguments: { action: "instructions", change, artifact, store? } }`; planning complete stays `{ tool: "openspec_apply_next", ... }`.
- `projectContextMember` `fetch`: becomes `{ tool: "openspec_inspect", arguments: { action: "show", type: "spec", store: id }, note: "Set name to a spec id from this store; openspec_inspect with action: list and specs: true lists them." }`.

Every other field of every projection is unchanged. Leaving the old names would make the model call a tool that no longer exists, so this is the one permitted response change and the spec records it.

### Output schema: top-level `oneOf`, six branches, nested `oneOf` for the two multi-shape actions

`output.schema` is `{ oneOf: [list, status, show, instructions, context, validate] }`. `list` and `instructions` each contain a nested `oneOf` because they have two shapes:

- `list`: `{ oneOf: [ { setup, root?, changes, issue? }, { setup, root?, specs, issue? } ] }`
- `instructions`: `{ oneOf: [ artifact shape, { change, artifact: "archive", context?, guidance?, root? } ] }`

Mutual exclusion is by required fields: `list` requires `changes` or `specs` (plus `setup`), `status` requires `artifacts`, `show` requires `kind`, `instructions` requires `artifact`, `context` requires `members`, `validate` requires `valid`. The nested branches use `const`/`enum` on `kind` and `artifact` where they would otherwise overlap.

The `dsh-tools` schema subset supports `oneOf` and `const`, rejects `type` beside `oneOf`, and validates exactly one match. Registration runs `assertSupportedJsonSchema`, so a malformed branch fails at load time rather than at the first call.

Alternative considered: a loose `{ type: "object" }` output. Rejected because it drops the runtime result validation the six tools had and lets a projection regression ship silently.

### No aliases; one minor version

The six registrations are replaced, not supplemented. Aliases would keep the fixed prompt cost and let stale prompts keep calling old names. The package moves to `0.3.0`; the skills are served by the plugin provider, so no project files need migration.

### CLI mapping is part of the change

Four places carry the mapping and all four are updated:

- `README.md` `CLI 对照` rows for `list`, `show`, `validate`, `status`, `instructions`, `context` name `openspec_inspect` with the action; the `templates` row keeps pointing at the instructions action.
- `skills/openspec-*.md` calls become `openspec_inspect` with the action; step numbers and prose stay unchanged.
- `lib/policy.js` tool references become `openspec_inspect` with the action.
- `mapInstructionCommands` maps the instruction's CLI fragments to inspect calls: `openspec list --specs` becomes `` `openspec_inspect` with `action: "list"` and `specs: true` ``, `openspec show` becomes inspect with `action: "show"`, `openspec validate` becomes inspect with `action: "validate"`.

A regression test scans the packaged skills, policy and README for the six old names and fails if any survive.

## Risks / Trade-offs

- [The model picks the wrong action] → The description names each action and the error names the expected parameter; the eval harness compares action choice and error rate against the former surface.
- [A parameter is passed to the wrong action] → The per-action table rejects it before the read, with an error naming the action.
- [An `oneOf` branch overlaps another] → A test runs every action's projection through the schema and asserts exactly one branch matches; `assertSupportedJsonSchema` catches structural mistakes at load.
- [Prompt savings are offset by a longer description] → A test pins the registered inspect schema size under the former 3,820 characters.
- [Skills or README drift back to old names] → The scan test above fails; the instruction rewrite test pins the new mapping text.
- [Status and context responses change] → The change is limited to `tool` and `arguments.action`; projection tests assert every other field is unchanged.

## Migration Plan

No data migration. Deploy as `0.3.0`; the provider serves the new skills and the Host registers the new tool on restart. Rollback is a revert of the change commit: the six registrations and the old references return together.

## Open Questions

None.
