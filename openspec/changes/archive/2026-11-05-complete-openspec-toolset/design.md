# Design: Complete OpenSpec toolset and skill adaptation

## Context

The plugin is five tools and one skill. The OpenSpec CLI stays authoritative for schema resolution, roots, stores, validation and archive merge. The official DSH integration is skills-only: six `SKILL.md` files under `.dsh/skills/`, all written to drive the CLI. The project's own `AGENTS.md` already applies through the compact loop, so the change must preserve that loop while extending the surface.

Relevant facts:

- Project skills rank 100; runtime registrations rank 250. A plugin cannot shadow a project skill by registering the same name.
- `openspec init --tools none` writes the config and `specs/` but no skill files.
- The bundled `spec-driven` instruction text still names CLI commands.
- The CLI is pinned at 1.16.0 and its option set was checked for every new tool.

## Goals / Non-Goals

Goals:

- One tool per agent-visible workflow step, with compact projections.
- A single skill source written by the plugin, so `openspec update` cannot rewrite it.
- An explicit, reversible migration for projects that already have official skills.
- No behavior change to the apply loop.

Non-Goals:

- Removing the CLI dependency, or reimplementing schema, validation or archive merge.
- Covering global management commands such as `update`, `install`, `config`, `workset`, `view` or `completion`.
- Forking the project schema in this change.
- Automatic migration on plugin load.

## Decisions

### Tool layer wraps the CLI

Every new tool calls the bundled CLI and projects its JSON. Schema, root and store semantics stay in one place and follow the pinned version. The alternative, reimplementing the core, is roughly 8–12k lines and freezes the project format.

### Init uses `init --tools none`

The CLI creates `openspec/config.yaml` and `openspec/specs/`; the plugin writes skills. This keeps the config template and root detection authoritative without letting the CLI generate official skills. If the call turns out to have global side effects, replace it with a small config writer.

### Skills keep the official names

Keeping `openspec-apply-change` and the rest preserves user muscle memory and slash entries. Files are written to the project, so rank 100 applies and no provider override is needed. The generated `openspec-flow` skill stays as an index and is not duplicated into the project.

### Migration is explicit and backed up

`openspec_init` is the only entry point. It classifies each same-named skill by `generatedBy`: OpenSpec version, plugin version, or unrecognized. Recognized skills are backed up to `.dsh/openspec-flow-backup/<timestamp>/` and replaced; unrecognized ones are reported as conflicts unless `force` is set. Backups live outside `.dsh/skills` so DSH does not load them.

### Instructions text is mapped, not forked

The plugin replaces known CLI fragments in the `openspec_instructions` projection. A mapping table and a post-condition assertion cover the pinned 1.16.0 text. Forking the schema is deferred because it changes project structure and the schema gate.

### Archive validates before writing

`openspec_archive` runs `openspec_validate` first and refuses on findings. It exposes `skipSpecs` but not `--no-validate`. This keeps archive from becoming a way to bypass the gate.

## Risks / Trade-offs

- The `init --tools none` call may have side effects not visible in the source; verify on a temporary fixture before relying on it.
- Six rewritten skills are tied to OpenSpec 1.16.0. A CLI upgrade requires re-checking every command reference.
- The instruction mapping is a string replacement; a missed fragment leaves a CLI command in the text. The post-condition assertion turns that into a test failure.
- Thirteen tool definitions add fixed prompt cost. Descriptions stay short and results stay projected.
- Unmigrated projects have two entry points. The policy and tool descriptions must name the tool path first.

## Migration Plan

1. Ship the tools and the six skills in the plugin package.
2. A user runs `openspec_init` once per project.
3. The tool backs up and replaces official skills, then reports what changed.
4. Re-running after a plugin upgrade refreshes the skills by version.
5. Rollback: restore the backup directory, or `git revert` the plugin commit.

## Open Questions

- Whether `init --tools none` writes any global configuration. Verified by fixture in the init tests.
- Whether a future OpenSpec release changes the instruction text enough to need a schema fork.
