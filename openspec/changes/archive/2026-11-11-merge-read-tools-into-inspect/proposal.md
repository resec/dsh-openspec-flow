# Merge read tools into one inspect entry

## Why

The core change flow advertises six separate read tools — list, status, show, instructions, context and validate — each with its own name, description and parameter schema. Those six schemas total 3,820 characters, 54% of the core catalog and 48% of all thirteen tools. Every request pays for all six, although they share the same session directory, the same optional `store` parameter and the same projection layer. The split buys no isolation, only prompt budget.

The measurement behind this change: `name + description + parameters` is what the Host projects to the model, and the six read tools contribute 3,820 of the 7,943 characters the plugin registers. A single entry with an `action` selector is measured at about 1,530 characters in the same style, a saving of about 2,290 characters per request.

## What Changes

- **BREAKING** Replace `openspec_list`, `openspec_status`, `openspec_show`, `openspec_instructions`, `openspec_context` and `openspec_validate` with one `openspec_inspect` tool. Its `action` parameter selects `list`, `status`, `show`, `instructions`, `context` or `validate`.
- Keep `openspec_apply_next` separate: it caches the full apply payload for `openspec_mark_task_done` and is not a pure read.
- Keep every action's response body unchanged, with one exception: tool references inside response bodies (`nextSteps[].tool` and `members[].fetch.tool`) now name `openspec_inspect` and carry the action they require. Leaving the old names would make the model call a tool that no longer exists.
- Validate action and parameter combinations before the read runs, with errors that name the missing or misplaced parameter.
- Declare one strict `oneOf` output schema with a branch per action, so the merged tool keeps the output validation the six tools had.
- Update the packaged skills, the policy text, the README tool tables and the CLI command mapping to the new entry.
- No dependency change and no OpenSpec CLI change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `tool-surface`: the read surface becomes a single `openspec_inspect` entry with action routing, per-action parameter checks, a strict `oneOf` output schema, and updated tool references in the status and context projections.
- `skill-adaptation`: the instruction-text mapping now names `openspec_inspect` with its action parameter instead of six tool names.

## Impact

- Code: `lib/tools/query.js` (six registrations become one, the six handlers stay as internal functions), `lib/tools/index.js`, `lib/state.js` (status `nextSteps` and context `fetch` references).
- Documentation and prompts: `skills/openspec-*.md`, `lib/policy.js`, `README.md` tool tables and CLI mapping.
- Tests: new inspect contract tests for action routing, parameter errors and `oneOf` validation; existing integration, description and skill tests updated.
- Tool catalog: thirteen tools become eight; the core block becomes five tools (`openspec_inspect`, `openspec_apply_next`, `openspec_mark_task_done`, `openspec_new_change`, `openspec_archive`).
