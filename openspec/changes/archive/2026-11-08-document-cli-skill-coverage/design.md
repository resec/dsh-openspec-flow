# Design: README coverage tables

## Context

`README.md` describes the plugin surface in four places: 能力 lists the thirteen tools, 流程覆盖 summarizes workflows and also states command-level facts (store, custom schema, global commands), 技能与初始化 describes the skill provider and the removed sync skill, and 限制 repeats several of those statements. There is no command-level or skill-level matrix.

## Goals / Non-Goals

**Goals**

- One home per fact: workflow status in 流程覆盖, command status in CLI 对照, skill status in 官方技能对照, operational constraints in 限制.
- Every claim checkable: each row names the tool or states that none exists, and each table cites its reference list and the version it was checked against.

**Non-Goals**

- No changes to code, tests, tool descriptions, packaged skills or specs.
- No attempt to document CLI internals or output formats beyond the support status.

## Decisions

**One row per top-level command, subcommands folded in.** `new change` keeps its own row because it is the only subcommand the plugin wraps; `config`, `schema`, `store` and `workset` collapse their subcommands into the parent row. This keeps the table at 22 rows while still naming every subcommand that lacks coverage.

**Deprecated commands are named once, not tabulated.** `openspec change` and `openspec spec` are excluded by a sentence under the heading, because the CLI itself warns and points to the verb-first commands.

**Merge by deleting the narrower statement, not by shortening both.** 流程覆盖 loses five rows that the CLI table now states precisely; 技能与初始化 loses its sync paragraph; 限制 loses the two support-status bullets. The remaining bullets are constraints (pinned version, store verification gap, stale skill copies), not restatements.

**Citations sit under each heading and pin the tag.** Each table's lead sentence links the `v1.16.0` file on GitHub instead of the moving docs site, so the reference cannot drift from the bundled CLI. The tag carries the version, which makes a fetch date or "verified on" note perishable noise; a later CLI bump changes one tag in two links.

**Chinese prose, code spans for identifiers.** Matches the existing README; command names, tool names and flags stay in backticks.

## Risks / Trade-offs

- [Two tables add ~50 lines to a 208-line README] → Tables replace five rows and two bullets, so the net growth is smaller than the row count suggests; 流程覆盖 stays as the short entry point.
- [Option lists drift on a CLI upgrade] → The version note under each heading makes the stale spot explicit; the CLI is pinned to 1.16.0.
- [Readers may treat the tables as a contract] → The lead sentence says "对照对象" and the 限制 section keeps the pinned-version constraint, so the tables describe the current pin, not a guarantee.

## Migration Plan

Single documentation edit; no deployment or rollback steps. Reverting is `git revert` of the change commit.

## Open Questions

None.
