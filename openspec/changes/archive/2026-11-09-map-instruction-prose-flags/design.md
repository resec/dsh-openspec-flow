# Design: map instruction prose flags

## Context

See `proposal.md` — Why. `mapInstructionCommands` runs on `json.instruction` only. It currently has seven replacements for backticked commands such as `openspec validate`; bare flags are outside those patterns. The CLI wraps the proposal instruction at column 80, splitting "`--type`" and "spec`" across lines, so a literal match would miss it.

## Goals / Non-Goals

- Goal: no `--store`, `--type` or `--specs` in the returned instruction.
- Goal: keep the existing command replacements and their order.
- Non-goal: rewriting `context`, `rules`, `guidance` or any user-authored text.
- Non-goal: changing the CLI, the schema, or the skills that consume the fields.

## Decisions

### Targeted prose rules after the command rules

The command rules run first. Four targeted rules then run: `--store "<id>"`, `--type\s+spec`, `--specs`, and bare `--store`. Specific patterns precede the bare flag so `--store "<id>"` is not reduced to `store "<id>"`. Patterns require backticks, so paths and prose are not touched.

### Whitespace-tolerant type match

The pattern `--type\s+spec` matches the line-wrapped form without depending on a fixed column. The replacement is `type: "spec"`, the same syntax the existing command rule produces.

### Instruction-only scope

The map is called only from `projectInstructions` on `json.instruction`; `context` and `rules` are copied verbatim. A test pins that boundary so a future refactor cannot rewrite configured project text.

## Risks / Trade-offs

- [A future CLI instruction uses a flag with a different meaning] → The map covers only the three current flags, and the integration test reads the pinned CLI 1.16.1 output for all four artifacts.
- [A bare `--store` appears in a code example] → The replacement keeps backticks and only changes the flag text; an example that intentionally shows CLI syntax would be changed, but the contract is that the tool returns tool syntax.
- [Regex order regresses] → Unit cases cover `--store "<id>"`, bare `--store`, and the split `--type`; order is explicit in the array.

## Migration Plan

No migration. Revert the commit to restore the previous text.

## Open Questions

None.
