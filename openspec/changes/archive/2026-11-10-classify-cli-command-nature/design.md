# Design: Classify CLI command nature in the README

## Context

See `proposal.md` for motivation. The `## CLI 对照` table has 22 rows and four columns: `CLI 命令`, `作用`, `插件支持`, `对应工具与差异`. Its rows follow the bundled `@fission-ai/openspec` 1.16.1 `--help` order, and the lead paragraph already excludes the deprecated `change` and `spec` noun groups.

The official `docs/cli.md` Summary groups commands by purpose (Setup, Stores, Health, Working context, Personal worksets, Browsing, Validation, Lifecycle, Workflow, Schemas, Config, Utility). That grouping answers "what is this command for", not "does it read or write specs". The new column adds the second axis without replacing the purpose-oriented `作用` column.

## Goals / Non-Goals

**Goals**

- Give every row exactly one value from a six-value vocabulary.
- Define the vocabulary before the table, including the exceptions that a single label cannot express.
- Keep the existing row order, support cells, and tool-difference cells unchanged.

**Non-Goals**

- No per-subcommand rows for grouped commands; the group keeps one row, as today.
- No change to the plugin's support status or tool surface.
- No claim that "只读" means zero byte written by the CLI process; the label describes the command's spec-domain effect, not telemetry or explicitly requested workspace files.

## Decisions

### Six values on one axis

The column uses six values:

| 值 | 判定标准 |
| --- | --- |
| `规格读` | 读取变更、主规格，或生成它们所需的工作流元数据（模板、schema）；不写 `openspec/` 根内的内容。 |
| `规格写` | 创建变更内容，或写入/移动主规格与变更目录。 |
| `Store 管理` | 管理本机 store 注册与 store 目录。 |
| `Workset 管理` | 管理本机个人工作视图。 |
| `OpenSpec 管理` | 项目初始化、工具集成、全局配置、schema 定义、CLI 安装/补全/反馈。 |
| `只读诊断` | 读取根、store 引用或工作上下文；不写规格内容。 |

Alternatives considered:

- Reuse the official purpose categories. Rejected: Setup, Lifecycle and Stores mix read and write commands, so the column would not answer the question that motivated it.
- Split every group into read and write subcommand rows. Rejected: the table deliberately mirrors the CLI's top-level shape; splitting `config`, `schema`, `store`, `workset` and `completion` would inflate it and duplicate the tool-difference cells.
- Add a seventh `工作流读` value for `templates` and `schemas`. Rejected: their output is the metadata that drives spec authoring, and the taxonomy paragraph can say so; a separate value would make the reader learn a distinction the table does not need.

### Placement after 作用

The column goes between `作用` and `插件支持`. A reader scans command name, purpose, nature, then support; putting nature before purpose would ask the reader to interpret the label before knowing what the command does.

### Grouped rows carry the domain label

`config`, `schema`, `store`, `workset` and `completion` each contain both read and write subcommands. The new cell names the domain (`Store 管理`, `Workset 管理`, `OpenSpec 管理`) and the existing `对应工具与差异` cell still lists the subcommands. `context` gets `只读诊断（可选写）` because `--code-workspace` writes a workspace file; every other 只读诊断 row is read-only.

### Boundary decisions

| 命令 | 值 | 理由 |
| --- | --- | --- |
| `init` | `OpenSpec 管理` | 创建 `openspec/` 结构、`config.yaml` 与工具集成文件，但不写需求内容。 |
| `update` | `OpenSpec 管理` | 重写工具 skills/commands，可能迁移全局 config；不碰规格。 |
| `config` | `OpenSpec 管理` | 只操作全局 `config.json`，其中 `defaultStore` 只影响后续根解析。 |
| `list`、`show`、`view`、`validate` | `规格读` | 只读变更、规格或校验结果。 |
| `archive` | `规格写` | 合并/退役主规格并移动变更；`--skip-specs` 时只移动，但命令性质仍属规格写。 |
| `new change` | `规格写` | 创建变更目录与 `.openspec.yaml`；必要时补建 root 的 `config.yaml`、`specs/`、`changes/archive/`。 |
| `status`、`instructions` | `规格读` | 只读变更 artifacts、模板与项目配置，不写文件。 |
| `templates`、`schemas` | `规格读` | 只读模板路径与 schema 清单，是规格工作流的元数据。 |
| `schema` | `OpenSpec 管理` | `which`/`validate` 只读，`fork`/`init` 写 `openspec/schemas/` 或项目 config；属于工作流定义管理。 |
| `store` | `Store 管理` | 管理本机 registry、store metadata 与 store 目录；`store remove` 的删除范围包含 `specs/`、`changes/`，但命令仍属 store 管理。 |
| `doctor` | `只读诊断` | 只读根、store 与引用健康。 |
| `context` | `只读诊断（可选写）` | 默认只读；`--code-workspace` 是唯一写操作，且只写指定 workspace 文件。 |
| `workset` | `Workset 管理` | 管理本机 `worksets.yaml` 与生成的 workspace 文件，不碰成员目录。 |
| `version`、`install`、`feedback`、`completion` | `OpenSpec 管理` | 分别涉及 CLI 版本检查、独立二进制安装、外部反馈与 shell 补全，均不写规格。 |

### Sources and verification

Row values follow the bundled 1.16.1 CLI help and its write points, not `docs/main`, which may lead the pinned release. The implementation task re-counts the 22 rows and checks each value against the definitions above. Because the change is documentation-only, there is no new unit test; the existing `npm test` and coverage gates still run.

## Risks / Trade-offs

- [Taxonomy drifts when the CLI adds or renames a command] → The tasks require re-counting the rows against the bundled `--help` and assigning a value from the fixed vocabulary; a future command that fits none of the six values forces an explicit design decision.
- [“只读” is read as “writes nothing at all”] → The taxonomy paragraph defines it as “不写规格内容”, and `context` carries `（可选写）`; the label does not claim the CLI process performs zero I/O.
- [Group labels hide read/write subcommand mixes] → The `对应工具与差异` column still lists subcommands, and the paragraph states that a group label names the domain rather than every subcommand.
- [A wide table becomes harder to scan] → Values are short; no existing column is removed or reordered.

## Migration Plan

None. The change edits `README.md` only; rollback is a revert of that documentation commit. No runtime, data, dependency or version migration.

## Open Questions

None.
