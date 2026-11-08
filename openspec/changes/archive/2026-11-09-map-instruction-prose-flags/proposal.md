# Map instruction prose flags to tool parameters

## Why

`openspec_instructions` already replaces backticked CLI commands, but the built-in schema instruction also mentions bare flags in prose: `--store "<id>"`, `--type` wrapped before `spec`, and `--specs`. The response therefore teaches two parameter conventions at once, and the line-wrapped `--type` cannot match a command-level pattern. The tool-surface contract says an agent never needs the CLI; the returned instruction is the last place where it is still told CLI syntax.

## What Changes

- Extend `mapInstructionCommands` with prose flag rules: `--store "<id>"` becomes `store: "<id>"`, a line-wrapped `--type spec` becomes `type: "spec"`, `--specs` becomes `specs: true`, and a bare `--store` becomes `store`.
- Apply the prose rules after the existing command rules so a replaced command never leaves a flag behind.
- Add unit coverage for all four forms and integration coverage that reads every artifact instruction from the bundled CLI and asserts no `--store`, `--type` or `--specs` remains.
- Add a `tool-surface` requirement: the returned `instruction` names tool parameters, and configured `context` and `rules` are not rewritten.

## Capabilities

### Modified Capabilities

- `tool-surface`: instruction projection gains a requirement that prose CLI flags become tool parameter syntax, scoped to the `instruction` field.

## Impact

- `lib/state.js` (`INSTRUCTION_COMMAND_MAP`, `mapInstructionCommands`)
- `test/projections.test.mjs`, `test/integration.test.mjs`
- `openspec/changes/map-instruction-prose-flags/specs/tool-surface/spec.md`
- No tool name, parameter, output field, dependency or configuration change.
