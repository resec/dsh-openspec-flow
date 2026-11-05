# Restrict schema support to the built-in spec-driven schema

## Why

The plugin is built and tested against OpenSpec CLI 1.16.0. OpenSpec does not define a compatibility contract between the CLI version and a project schema: `schema.yaml`'s `version` is a required positive integer whose value does not change CLI behavior, and the CLI strips unknown schema fields. A project-local or user schema can therefore be read with only part of its declared structure, producing apply instructions and progress that look valid while the plugin's assumptions no longer hold.

The plugin already declares a narrow support boundary in its README; this change makes that boundary enforceable instead of advisory.

## What Changes

- Add a schema gate that accepts only the CLI's built-in `spec-driven` schema.
- Reject any other schema name, including custom schemas selected through `.openspec.yaml` or `openspec/config.yaml`.
- Reject a `spec-driven` schema shadowed by a project-local or user-level schema directory, because that is not the built-in copy.
- Apply the gate to `openspec_status`, `openspec_apply_next`, and `openspec_validate` before their results are returned.
- Return an actionable error that names the change, the schema, the shadow path when one exists, and how to recover.
- Document the restriction and add unit plus integration regression tests.

## Capabilities

### New Capabilities

- `schema-compatibility`: defines which schema the plugin accepts, how it recognizes the built-in copy, and how unsupported schemas are rejected.

### Modified Capabilities

None.

## Impact

- Affected code: a new schema-gate module, `lib/state.js`, `lib/tools.js`, the shipped `openspec-flow` skill, and the test suite.
- Documentation: `README.md` support limits.
- No CLI change, no new dependency, and no change to the five tool schemas or output shapes for accepted changes.
