# Classify CLI command nature in the README

## Why

The `## CLI 对照` table lists every bundled CLI command and its plugin support, but not what kind of command it is. A reader cannot tell whether a command reads or writes `openspec/specs` and `openspec/changes`, manages a machine-level store or workset, or manages OpenSpec itself. The distinction is not cosmetic: `init` and `new change` both write under `openspec/`, yet one is project setup and the other creates spec-domain content; `store remove` is a store-management command that deletes a checkout containing `specs/` and `changes/`.

The official CLI reference groups commands by purpose (Setup, Stores, Health, Browsing, Lifecycle, Workflow, Schemas, Config, Utility), but that grouping is not a read/write classification. The README needs the second axis so a reader can answer "does this command touch the specs?" without opening the CLI source.

## What Changes

- Add a `命令性质` column to the 22-row `## CLI 对照` table in `README.md`, after `作用`.
- Use six values: `规格读`、`规格写`、`Store 管理`、`Workset 管理`、`OpenSpec 管理`、`只读诊断`.
- Add a short paragraph before the table defining the six values, including the two exceptions: grouped commands that contain both read and write subcommands, and `context --code-workspace`, which writes only a workspace file.
- Keep the command order, `插件支持` cells, and `对应工具与差异` cells unchanged.

Not included: no code, tests, tool descriptions, packaged skills, dependencies, version pins, or spec-level behavior changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. This is a pure documentation change: `.openspec.yaml` sets `skip_specs: true`, because the README classification does not change any plugin or CLI behavior.

## Impact

- `README.md`: one new column with 22 values and one taxonomy paragraph.
- `openspec/changes/classify-cli-command-nature/.openspec.yaml`: the `skip_specs` marker.
- No source, tests, package metadata, or packaged skills.
