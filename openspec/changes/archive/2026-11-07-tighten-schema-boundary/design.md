# Design: tighten the schema boundary

## Context

See `proposal.md` for the motivation. Today `openspec_new_change` probes `openspec list --json` only to prove a root exists, then invokes `openspec new change <name> --json` without a schema argument. The CLI resolves the schema from `--schema`, then the project's `openspec/config.yaml`, then the root default, so a project with `schema: custom` yields a change that later change-scoped tools reject. `openspec_schemas` projects every entry the CLI reports, including custom schemas and project or user shadows.

The existing `assertBuiltinSchema` already knows how to reject a non-built-in name and a shadowed `spec-driven`, but it needs a change name and runs after a change exists.

## Goals / Non-Goals

**Goals**

- Make `openspec_new_change` fail before any write when the project schema or the built-in copy is unsupported.
- Make `openspec_schemas` agree with the tools that actually accept a change schema.
- Keep the check dependency-free: Node built-ins only, no YAML package.

**Non-Goals**

- Supporting custom schemas or making the schema gate configurable.
- Changing the schema semantics of the CLI or the existing change-scoped tools.
- Adding a schema-repair command.

## Decisions

### Read the project schema before creating

`openspec_new_change` reads the top-level `schema` scalar from `<root>/openspec/config.yaml`, falling back to `config.yml`. A value other than `spec-driven` is rejected before `new change` runs. The check deliberately parses only the simple top-level form: a quoted scalar or an inline comment is normalized, and an unrecognized or complex value is treated as unsupported rather than passed through.

Alternatives considered:

- Pass `--schema spec-driven` and let it override the project config. Rejected: it silently changes the user's declared workflow instead of reporting the mismatch.
- Create first, then inspect `change.schema` and remove the directory on failure. Rejected: it leaves a partial change on a failed call and needs a delete path that does not exist.
- Import the CLI's internal project-config parser. Rejected: it is not a public entry point and would couple the plugin to internal layout.

### Pass `--schema spec-driven` and verify the result

After the pre-check, the create command includes `--schema spec-driven`. This removes the root-default fallback as a source of an unsupported change. The tool then verifies the reported `change.schema`; a mismatch is reported as an error rather than returned as a success.

The explicit flag is a consistency guard, not an override: the only project configuration that reaches this point is `spec-driven` or an absent selection.

### Filter the schema listing by name and source

`openspec_schemas` returns an entry only when its name is `spec-driven` and its source is `package`. This mirrors `assertBuiltinSchema`: a project or user `spec-driven` is a shadow the change tools reject, and every other name is unsupported. The projection keeps the existing fields, so consumers do not need a new shape.

Alternatives considered:

- Return every schema with a `supported` flag. Rejected: it still invites the agent to select an unsupported schema and adds a field to every response.
- Filter by name only. Rejected: it would advertise a shadow that the change gate rejects.

### Fail closed when the configuration cannot be read

If `openspec/config.yaml` exists but cannot be read, `openspec_new_change` returns an actionable error naming the path and creates nothing. A missing file is treated as no explicit selection and the explicit `--schema spec-driven` supplies the schema; an unreadable file is a state the tool cannot verify, so it does not write.

## Risks / Trade-offs

- [YAML subset] A config written with an unusual YAML form could be misread → only the top-level scalar is parsed; a value that is not exactly `spec-driven` is rejected, which is the safe direction.
- [Explicit schema] A project that changes its default schema to a future supported schema would still get `spec-driven` from this tool → the plugin's support boundary is intentionally one schema; supporting another one is a code change, not a config change.
- [Empty listing] A project or user shadow makes `openspec_schemas` return an empty list → the description states that only supported schemas are listed; `openspec_new_change` and the change-scoped tools name the shadow path in their errors.
- [Store mode] The config lookup uses the resolved root, which for a store is the store root. The store end-to-end path remains unverified on this machine, as before.

## Migration Plan

No data migration. Existing changes keep their schema; only new-change creation is gated. Rolling back means reverting the tool changes and the README table; existing change files are untouched.

## Open Questions

None.
