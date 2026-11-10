# Tasks

## 1. README 命令性质列

- [x] 1.1 在 `README.md` 的 `## CLI 对照` 表前补一段口径说明，定义 `规格读`、`规格写`、`Store 管理`、`Workset 管理`、`OpenSpec 管理`、`只读诊断` 六个值，并写明分组命令按域标注、`context --code-workspace` 是只读诊断的写文件例外。验证：六个值在说明中各出现一次，且说明明确“只读”指不写规格内容。
- [x] 1.2 在表头 `作用` 与 `插件支持` 之间加入 `命令性质` 列，分隔行同步增加一列。验证：表头严格为 `| CLI 命令 | 作用 | 命令性质 | 插件支持 | 对应工具与差异 |`，分隔行有 5 列。
- [x] 1.3 按 `design.md` 的边界表为 22 行各填一个性质值：`init`、`update`、`config`、`schema`、`version`、`install`、`feedback`、`completion` 为 `OpenSpec 管理`；`list`、`show`、`view`、`validate`、`status`、`instructions`、`templates`、`schemas` 为 `规格读`；`archive`、`new change` 为 `规格写`；`store` 为 `Store 管理`；`workset` 为 `Workset 管理`；`doctor` 为 `只读诊断`；`context` 为 `只读诊断（可选写）`。验证：数据行仍为 22 行，每行第 3 列都属于六个值或其带括号的例外形式。
- [x] 1.4 复核表格命令集与 bundled CLI 一致：运行 `node node_modules/@fission-ai/openspec/bin/openspec.js --help`，逐项确认除已废弃的 `change`、`spec` 外每个顶层命令恰好一行。验证：命令集合与表行一一对应，且没有新增或删除行。

## 2. 验证

- [x] 2.1 运行 `openspec_validate`（`change: classify-cli-command-nature`，`strict: true`）并确认无 finding。验证：返回 `valid: true`，无 warning 或 error。
- [x] 2.2 在 Node 24 上运行 `npm test` 并确认退出码为 0；该变更只改 `README.md`，失败应视为既有问题。验证：命令退出码为 0。
- [x] 2.3 在 Node 24 上运行 `npm run coverage:check` 并确认退出码为 0，覆盖率不低于基线。验证：命令退出码为 0。
- [x] 2.4 运行 `git status --short` 与 `git diff --stat`，确认改动只有 `README.md` 和本变更目录；没有 `lib/`、`test/`、`skills/`、`package.json` 或依赖改动。验证：diff 路径集合与预期一致。

## Workflow follow-up

- 归档只在用户明确要求后执行；本轮完成 apply 与验证后停住。
- 归档后把 `README.md`、变更归档目录一并提交并推送到 `origin/main`；该变更没有 spec delta，不产生主规格合并。
