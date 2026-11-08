# Document CLI and official-skill coverage

## Why

`README.md` is the plugin's user-facing description of its surface, but it never lists the bundled OpenSpec CLI's commands or the official skills one by one. Support status is spread across three sections — 流程覆盖, 技能与初始化, 限制 — that restate the same facts differently, so editing the tool surface can leave one section stale. A reader cannot tell which CLI options a tool exposes, and nothing states how each of the twelve official skills is handled.

## What Changes

- Add `## CLI 对照`: one row per non-deprecated command of the bundled OpenSpec CLI 1.16.0, naming the covering tool and the options it does and does not expose. Cite the tag-pinned v1.16.0 CLI reference.
- Add `## 官方技能对照`: one row per official skill (Core 6, Optional 6) with its type, how the plugin handles it, and the reason for every unshipped skill. Cite the tag-pinned v1.16.0 skills reference.
- Merge duplicated statements:
  - 流程覆盖 keeps only the five agent workflows (explore, propose, apply, update, archive); its initialize, store, custom-schema, global-command and sync rows move into the new tables.
  - 技能与初始化 drops the standalone `openspec-sync-specs` paragraph; the fact lives in the skill table and in the migration note under 限制.
  - 限制 drops the bullets whose support status is now stated in the new tables.
- State that the deprecated `openspec change` and `openspec spec` commands are out of scope.

Not included: no code, tests, tool descriptions, skills or specs change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. This is a pure documentation change, so `.openspec.yaml` sets `skip_specs: true`; no spec-level behavior changes.

## Impact

- `README.md`: two new sections and three edited sections.
- `openspec/changes/document-cli-skill-coverage/.openspec.yaml`: the `skip_specs` marker.
- No source, tests, package metadata or packaged skills.

Source of the reference lists:

- CLI commands, options and defaults: [OpenSpec v1.16.0 CLI reference](https://github.com/Fission-AI/OpenSpec/blob/v1.16.0/docs-lab/reference/cli.md), cross-checked against the bundled `@fission-ai/openspec` 1.16.0 `--help` output.
- Official skill inventory and contracts: [OpenSpec v1.16.0 skills reference](https://github.com/Fission-AI/OpenSpec/blob/v1.16.0/docs-lab/reference/skills.md).

Both links pin tag `v1.16.0`, the bundled CLI version, so a change on the moving docs site cannot silently alter the reference.
