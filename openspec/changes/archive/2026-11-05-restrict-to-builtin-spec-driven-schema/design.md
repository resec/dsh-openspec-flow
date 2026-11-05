# Design: Restrict schema support to the built-in spec-driven schema

## Context

The plugin invokes OpenSpec CLI 1.16.0 and projects its JSON into compact tool results. It reads `schemaName` from `status` and `instructions apply`, but never verifies which schema implementation produced the payload. OpenSpec resolves schemas from the project, the user data directory, then the CLI package. A project or user copy of `spec-driven` therefore shadows the built-in copy, and a custom schema can change artifacts, `apply.requires`, or `apply.tracks`.

The compatibility research (`openspec-cli-schema-compatibility.md`) shows that schema `version` is not a compatibility signal and that unknown fields are silently ignored. The plugin cannot safely support arbitrary schemas without implementing its own schema contract, which is out of scope.

## Goals / Non-Goals

**Goals**

- Reject every change that does not resolve to the CLI's built-in `spec-driven`.
- Detect both project and user shadows of the built-in name.
- Keep the gate cheap: no extra CLI process on every status or apply call.
- Apply the same rule to status, apply, and validate.

**Non-Goals**

- Supporting custom schemas or schema version negotiation.
- Changing the CLI, its resolution order, or its output.
- Adding a schema override mechanism.

## Decisions

### Detect the built-in copy from the documented resolution order

The CLI resolves a schema in this order: `<project>/openspec/schemas/<name>`, the user data directory, then the package. The plugin will accept `spec-driven` only when neither the project nor the user directory contains `spec-driven/schema.yaml`. In that case the CLI must resolve the package copy.

This avoids a second `schema which` subprocess on every status and apply call. It also works for store changes, where `schema which` has no `--store` option. The trade-off is that the plugin mirrors the documented path rule; tests pin the rule and the CLI version is fixed.

The project root comes from `planningHome.root` for status, from `changeRoot` when `planningHome` is absent, and from `changeDir` (`../../..`) for apply. If none can be derived, the gate fails closed with a "cannot verify schema source" error.

### Gate status, apply, and validate; not list

`openspec_list` only lists changes and task counts, so it does not read a schema. `openspec_status`, `openspec_apply_next`, and `openspec_validate` are gated before they return their result.

`openspec_mark_task_done` uses the cached apply entry created by `openspec_apply_next`; a new entry is only cached after the gate passes. A stale entry is reloaded through the gated path.

`openspec_validate` has no schema field in its JSON, so it runs `status --change` first and applies the same gate. Validation is one-shot, so the extra CLI call is acceptable.

### Fail with a stable, actionable message

The gate throws one error shape:

- unsupported name: names the change, the schema, and the supported `spec-driven`;
- project shadow: names the change and the project `schema.yaml` path;
- user shadow: names the change and the user `schema.yaml` path;
- missing root: says the plugin cannot verify the schema source.

All messages tell the caller to remove the schema selection or the shadowing directory.

## Risks / Trade-offs

- A project can contain an unused `openspec/schemas/spec-driven` directory; the plugin rejects the change even if the CLI would not use it. This is intentional: the directory is an override in the CLI's resolution order.
- The user-directory check mirrors `$XDG_DATA_HOME` and `%LOCALAPPDATA%`; a platform-specific layout that differs from the CLI would be a false accept or reject. Tests cover the documented paths, and the CLI version is pinned.
- The gate adds a `status` call to `openspec_validate`, increasing that tool's latency by one CLI invocation.
- Store support inherits the same path rule; a store-local `openspec/schemas/spec-driven` is rejected like a repo-local override.

## Migration Plan

No data migration. A change that uses a custom schema must be moved to `spec-driven` or recreated. The error text gives the two recovery actions. Existing `spec-driven` changes continue to work.
