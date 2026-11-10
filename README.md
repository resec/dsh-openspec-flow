# dsh-openspec-flow

DeepSeek Harness 的 OpenSpec 全流程插件。agent 通过 13 个 `openspec_*` 工具完成 propose、new、status、instructions、validate、apply、archive 与 init，不再手敲 `openspec` 命令。OpenSpec CLI 仍是 schema、root、store、校验与归档语义的权威，由插件在内部调用。

## 能力

| 分组 | 工具 | 作用 |
| --- | --- | --- |
| 读 | `openspec_list` | 列出变更与任务计数，或用 `specs: true` 列出能力规格 |
| 读 | `openspec_status` | 紧凑状态：schema、产物完成度、blockedBy、工具动作、编辑约束 |
| 读 | `openspec_show` | 读变更的 delta 或规格的 purpose、需求与场景 |
| 读 | `openspec_context` | 解析根与 store 身份、被引用 store 与诊断 |
| 读 | `openspec_schemas` | 列出插件支持的 schema；仅内置 `spec-driven` |
| 读 | `openspec_store_list` | 列出已注册 store |
| 规划 | `openspec_instructions` | 读产物的指令、输出路径、依赖与已存在文件；返回项目 `context` 与产物 `rules`；`archive` 返回归档 `context`/`guidance` |
| 规划 | `openspec_validate` | 校验 change、spec、全部 specs 或全部项目 |
| 写 | `openspec_new_change` | 创建变更目录与 `.openspec.yaml`；先检查项目 schema，不支持则拒绝 |
| 写 | `openspec_archive` | 先校验、再归档并合并 delta specs |
| 写 | `openspec_init` | 建 OpenSpec 项目结构与目录，不写技能 |
| apply | `openspec_apply_next` | 一次取 apply 状态、下一任务、contextFiles、指令与项目 `context`/`guidance` |
| apply | `openspec_mark_task_done` | 一次翻转一批任务的复选框，返回逐项状态、新进度与下一任务 |

写操作都有前置检查：`openspec_new_change` 与 `openspec_archive` 拒绝隐式创建根；`openspec_new_change` 在写入前拒绝非内置 schema 或同名覆盖；`openspec_archive` 在任务未完成或校验失败时不动文件；`openspec_init` 不覆盖已有配置，也不写技能文件。

`openspec/config.yaml` 的 `context`、`rules` 与 `operations.apply|archive.guidance` 由对应工具结果返回；未配置时省略。`openspec_instructions` 的 `archive` 返回归档 `context`/`guidance`，不是空的产物字段。

## 流程覆盖

Agent 工作流全部由插件技能与工具覆盖。

| 流程 | 入口 | 说明 |
| --- | --- | --- |
| 探索与读取 | `openspec-explore`；`openspec_list`、`openspec_status`、`openspec_show`、`openspec_context`、`openspec_schemas`、`openspec_store_list` | 只读，不写项目文件 |
| 提案 | `openspec-propose`；`openspec_new_change`、`openspec_instructions`、`openspec_validate` | 创建 change，写 proposal、specs、design、tasks |
| 实施 | `openspec-apply-change`；`openspec_apply_next`、`openspec_mark_task_done` | 紧凑 apply 循环；批量翻转任务 |
| 修订规划 | `openspec-update-change`；`openspec_instructions`、`openspec_validate` | 修改现有 artifacts；没有专用写工具 |
| 归档 | `openspec-archive-change`；`openspec_instructions`、`openspec_archive` | 先读归档 `context`/`guidance`、校验、检查任务，再移动并合并 delta specs |

## CLI 对照

对照对象为插件内置的 OpenSpec 1.16.1 CLI 与插件注册的 13 个工具。命令与选项清单来自 [tag v1.16.1 的 CLI 参考](https://github.com/Fission-AI/OpenSpec/blob/v1.16.1/docs-lab/reference/cli.md)，并以本机 `openspec --help` 逐条核对；参考文件按 tag 固定，不随上游文档变化。已废弃的 `openspec change` 与 `openspec spec` 不在对照范围内；「不支持」表示插件没有对应工具，命令仍可在终端执行。

| CLI 命令 | 作用 | 插件支持 | 对应工具与差异 |
| --- | --- | --- | --- |
| `init` | 初始化项目结构 | 部分支持 | `openspec_init` 固定执行 `init --tools none --no-animation`，只接受 `path`；不暴露 `--tools`、`--language`、`--force`、`--profile`；已有 `config.yaml` 时跳过 |
| `update` | 刷新已安装的指令文件 | 不支持 | 技能由插件 skill provider 提供，随插件版本生效；升级插件后重启会话即可 |
| `config` | 全局配置 | 不支持 | `path`、`list`、`get`、`set`、`unset`、`reset`、`edit`、`profile` 均未封装 |
| `list` | 列出变更或规格 | 部分支持 | `openspec_list`：`specs` 对应 `--specs`，`store` 对应 `--store`；不暴露 `--archived`、`--all`、`--sort` |
| `show` | 打印变更或规格 | 部分支持 | `openspec_show`：`name`、`type`、`noScenarios`、`store`，返回结构化投影；不暴露 `--deltas-only`、`--requirements`、`--diff`、`--requirement`、`--no-interactive` |
| `view` | 交互式仪表盘 | 不支持 | 终端 UI，无等价工具 |
| `validate` | 结构与任务校验 | 部分支持 | `openspec_validate`：`change`、`spec`、`specs`、`all` 四种 scope，另有 `strict`、`store`；不暴露 `--archived`、`--report`、`--changes`、`--concurrency` |
| `archive` | 归档并合并 delta 规格 | 部分支持 | `openspec_archive`：`skipSpecs` 对应 `--skip-specs`，`store` 透传；固定 `--yes --json`，归档前先跑一次 `validate`；不暴露 `--no-validate` |
| `new change` | 创建变更目录 | 部分支持 | `openspec_new_change`：`name`、`description`、`goal`、`store`；`--schema` 固定为内置 `spec-driven` |
| `status` | 产物完成状态 | 部分支持 | `openspec_status`：`change`、`store`；不暴露 `--all`、`--schema` |
| `instructions` | 产物与 apply 指令 | 部分支持 | `openspec_instructions` 覆盖 `proposal`、`specs`、`design`、`tasks`、`archive`；产物结果带项目 `context` 与 `rules`，`archive` 返回归档 `context`/`guidance`；`apply` 由 `openspec_apply_next` 承载并带 apply `context`/`guidance`；不暴露 `--schema` |
| `templates` | 产物模板路径 | 不支持 | 无工具；`openspec_instructions` 返回的 `outputPath` 已给出写入位置 |
| `schemas` | 列出工作流 schema | 部分支持 | `openspec_schemas` 只保留包内置 `spec-driven`，其余被过滤；`store` 透传 |
| `schema` | schema 检查与派生 | 不支持 | `which`、`validate`、`fork`、`init` 均未封装；自定义 schema 会被闸门拒绝 |
| `store` | store 管理 | 部分支持 | 仅 `openspec_store_list` 对应 `store list --json`；`setup`、`register`、`unregister`、`remove`、`store doctor` 不支持 |
| `doctor` | 根关系健康检查 | 不支持 | 无工具 |
| `context` | 工作上下文 | 部分支持 | `openspec_context`：root（含 store_id）、被引用 store（fetch 为工具动作）、诊断（含 code/fix）；不暴露 `--code-workspace`、`--force` |
| `workset` | 个人工作视图 | 不支持 | `create`、`list`、`open`、`remove` 均未封装 |
| `version` | 版本与更新检查 | 不支持 | 版本由依赖与 `engines` 固定，无工具 |
| `install` | 安装独立二进制 | 不支持 | 机器级安装，与插件无关 |
| `feedback` | 提交反馈 | 不支持 | 无工具 |
| `completion` | shell 补全 | 不支持 | 无工具 |

## 官方技能对照

对照对象为 [tag v1.16.1 的 Skills 参考](https://github.com/Fission-AI/OpenSpec/blob/v1.16.1/docs-lab/reference/skills.md) 列出的 12 份技能（Core 6、Optional 6）。插件重写 Core 中的 5 份，正文把命令替换为 `openspec_*` 工具调用，frontmatter 记录 `metadata.upstream: openspec@1.16.1`；未提供的技能不随插件分发。

| 官方技能 | 官方类型 | 插件处理 | 说明 |
| --- | --- | --- | --- |
| `openspec-explore` | Core | 提供，已重写 | 只读探索；先过滤概览，再全读相关 spec（含 scenarios）；使用 `openspec_list`、`openspec_status`、`openspec_show`、`openspec_context` |
| `openspec-propose` | Core | 提供，已重写 | 先读相关现有 specs 并暴露冲突；`openspec_new_change` 建变更，逐产物调 `openspec_instructions` 写文件，最后 `openspec_validate` |
| `openspec-apply-change` | Core | 提供，已重写 | `openspec_apply_next` 取一次状态与下一任务，之后按批 `openspec_mark_task_done` |
| `openspec-update-change` | Core | 提供，已重写 | 只改已存在的规划产物；没有专用写工具，文件由 agent 直接编辑 |
| `openspec-sync-specs` | Core | 不提供 | delta 规格只在 `openspec_archive` 时合并；插件无「只同步不归档」流程 |
| `openspec-archive-change` | Core | 提供，已重写 | 先读归档 `context`/`guidance`、查任务与 `openspec_validate`，再调 `openspec_archive` |
| `openspec-new-change` | Optional | 不提供技能 | 创建动作由 `openspec_new_change` 工具承担，`openspec-propose` 内含该步骤 |
| `openspec-continue-change` | Optional | 不提供 | 由 `openspec_status` 判定下一个待办产物、`openspec_instructions` 给指令，但没有单产物推进的技能封装 |
| `openspec-ff-change` | Optional | 不提供 | 无独立技能；`openspec-propose` 已一次写完全部产物，对内置 schema 效果等价 |
| `openspec-verify-change` | Optional | 不提供 | 无 verify 工具；结构检查用 `openspec_validate`，实现与计划的对照需人工复核 |
| `openspec-bulk-archive-change` | Optional | 不提供 | `openspec_archive` 一次只处理一个变更 |
| `openspec-onboard` | Optional | 不提供 | 教学向流程，未适配 |

## 技能与初始化

五份流程技能由插件的 skill provider 提供：插件在 `ctx.skills` 上注册一个 provider，rank 50，低于项目 `.dsh/skills`（100）与 `.agents/skills`（200），因此项目内的同名副本不会遮蔽插件文本，插件升级后重启会话即生效。目录构建只读 frontmatter，正文在选中时才读取。

`openspec_init` 只做项目初始化：若项目还没有 `openspec/config.yaml`，执行 `init --tools none --no-animation`，创建配置、`specs/`、`changes/` 与 `changes/archive/`，不生成官方技能，也不写任何技能文件。技能 frontmatter 的 `metadata.generatedBy` 记录 `dsh-openspec-flow@<version>`；不要把这些技能复制进 `.dsh/skills/`。

## 安装

在 DeepSeek Harness 中把本目录作为 bundle 安装：

```text
plugin_manager action=install_bundle target=/path/to/dsh-openspec-flow
```

安装后插件行 id 为 `openspec-flow`。本包是 Host-only bundle，无构建脚本、无 `@deepseek-ai/*` 运行时依赖；工具、技能与策略都从 `index.js` 注册。安装时由包管理器安装 `@fission-ai/openspec` 1.16.1；以本地 linked 目录安装时，需要先在插件目录执行 `npm install`。

对已有项目，`openspec_init` 只补项目结构；技能无需安装，插件加载后即可用。

## 版本兼容性

升级 `@fission-ai/openspec` 的检查、修改与测试步骤见 [docs/upgrading-openspec-cli.md](docs/upgrading-openspec-cli.md)。

`package.json` 的 `engines` 声明两项：

- `dsh`：`=0.2.2-rc.1`。只接受该 DSH 运行时；其他版本在安装或 profile 启动检查时被拒绝，除非 profile 的 `compatibility.json` 中有针对该精确版本的豁免。DSH 仍处 alpha，逐个版本验证后再调整。
- `node`：`>=24.9.0`。与 DSH 0.2.2-rc.1 的 Node 下限一致；插件与 DSH 同进程运行，不单独支持更低的 Node。

升级 DSH 依赖时：

1. 读取目标 DSH 版本的 `engines.node`。
2. 把本插件的 `engines.node` 对齐到同一下限。
3. 把 `engines.dsh` 改为该 DSH 的精确版本。
4. 重启 DSH，确认 stderr 没有 `skipping profile bundle`，`openspec_*` 工具正常注册。

版本不匹配时 DSH 会跳过整个 bundle：工具、技能与流程规则都不会注册，stderr 输出 `dsh: skipping profile bundle "dsh-openspec-flow": ...`。

### 测试运行时

测试和覆盖率只允许运行在 Node 24 上，且具体版本必须满足 `engines.node`。大版本 24 对齐 DSH 0.2.2-rc.1 的 `PRIMARY_NODE_VERSION`。

命令只检查当前 `PATH` 上的 `node`，不会调用 fnm、nvm、volta，也不读取 `.nvmrc`。如果当前 `node` 不是 24，或具体版本低于 `>=24.9.0`，命令会在测试启动前报错退出。本机默认 `node` 可能是 26，运行前需手动激活 Node 24。

## 不变量

跨 capability 的取值只在 `project-invariants` capability 中声明一次：Node 主版本与 `engines.node` 下界、OpenSpec CLI 精确版本与 schema 信封版本、覆盖率下限。归档后该 capability 位于 `openspec/specs/project-invariants/spec.md`。

其他 spec 只引用该 capability，不重复取值。这条规则由评审执行，没有测试会在复述时失败。

## 配置

`cordis.patch.yml` 的 `config` 可覆盖：

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `timeoutMs` | `30000` | 单次 CLI 调用的墙钟上限，1000–300000。 |

CLI 来源固定：

- 只运行插件安装树内的 `@fission-ai/openspec`，精确版本 `1.16.1`；不读取 `PATH`、项目本地 `node_modules/.bin/openspec` 或 `cliPath`。
- 首次 CLI 调用执行 `openspec version --json`，要求 `version` 为 `1.16.1` 且 `schemaVersion` 为 `1`；不匹配时在运行目标命令前失败。
- 安装树缺少 CLI 时提示重装插件。旧配置中的 `cliPath` 会被配置校验拒绝。

## 设计要点

- **CLI 是权威**：schema、store、root、产物状态、校验与归档合并全部来自 `openspec`；插件不重新实现这些语义。
- **CLI 唯一内置**：只运行插件安装树内的 `@fission-ai/openspec` 1.16.1，首次调用校验版本，同一进程内缓存结果。
- **工具投影**：每个读工具返回 CLI JSON 的紧凑投影，保留下一步需要的字段，去掉内部结构。
- **路径基准**：项目内路径相对 `root.path`，根自身用 `.`，分隔符统一为 `/`；含相对路径的响应同时返回绝对 `root.path`，`openspec_apply_next` 与 `openspec_archive` 携带它。根外路径（store 根与元数据、根外 planning home）保持绝对；`openspec_init.root` 保持绝对。`openspec_mark_task_done` 不重复携带根，其 `next.sourcePath` 相对 `openspec_apply_next` 的 `root.path`，并接受相对 `sourcePath` 输入。
- **schema 闸门**：change 作用域的工具只接受内置 `spec-driven`；项目或用户目录中的同名覆盖会被拒绝。
- **指令映射**：`openspec_instructions` 返回的正文里，已知 CLI 命令片段被替换为对应工具名，路径保持不变。
- **一次取数**：`openspec_apply_next` 执行一次 `instructions apply --json`，把完整载荷留在进程内，只向模型返回投影。
- **每批 O(1)**：`openspec_mark_task_done` 先解析整批 id 并逐行翻转目标复选框，任一 id 缺失则整批不写；进度按缓存增量更新，下一任务从缓存任务表选取。
- **写操作可恢复**：`openspec_archive` 先校验后移动；`openspec_init` 只在缺少配置时创建目录，不覆盖已有配置。
- **按项目注入规则**：流程规则通过 agent 自己的 context 注册为作用域内 system prompt 段；非 OpenSpec 项目返回空文本。

## 真实模型评测

评测 harness 已迁至独立仓库 `dsh-openspec-flow-eval`，该仓库包含 harness 规格、夹具、离线测试与覆盖率门禁。本仓库不再包含 `eval/`，也不再提供 `eval:*` 命令。

## 验证

在 OpenSpec 1.16.1、本机 DSH 0.2.2-rc.1、Node 24.22.2 上：

- `npm test` 覆盖工具投影、参数校验、apply 循环、schema 闸门、写入类工具、init、技能 provider 与指令映射。
- 39 任务变更：`instructions apply --json` 单次 13,664 B；`apply_next` 780 B，每 4 个任务一批共 10 次 mark，平均 448 B，合计 5,258 B，约为「每任务重跑」53.3 万字节的 1.0%。
- 10 次批量 mark 期间 CLI 子进程启动次数为 0，证明循环不再是 O(N²) 查询。
- 测试使用真实 `@fission-ai/openspec` 1.16.1，不是 mock。

复跑：

```text
cd dsh-openspec-flow
npm test
```

### 覆盖率

覆盖率与测试在同一次运行中采集，不会为了覆盖率再跑一遍测试：

- `COVERAGE=1 npm test`：单次运行并写 `.coverage/plugin.info`；不设置 `COVERAGE` 时不采集。
- `npm run coverage`：运行一次插件测试并采集覆盖率，写 lcov、`.coverage/report.md`，按 report 模式输出违规。
- `npm run coverage:check`：同样的单次运行，按 enforce 模式判定；存量覆盖率不足时会失败。
- `npm run coverage:baseline`：单次运行后更新 `coverage.baseline.json`；默认拒绝下调，必要时应显式传 `--allow-lower --reason`。

基线记录具体 Node 版本和 `engines.node` 范围；门禁要求当前与基线都满足主版本 24 且落在范围内，允许 24.x 补丁差异并在报告中提示。当前为 enforce 模式，`npm run coverage:check` 是完成变更的必需检查。

运行 `npm run hooks:install` 会把 `core.hooksPath` 指向 `.githooks`，pre-push 先执行 `npm run openspec:check`，再执行 `npm run coverage:check`。`openspec:check` 用 `--all --strict` 检查活动 change 与主 specs，用 `--archived --strict` 检查归档 change 的任务完成状态；任一警告都会阻止推送。归档 change 的 delta 正文不在 CLI 的严格校验范围内。钩子不调用 fnm；Node 24 未激活时覆盖率步骤会直接报预检错误。`COVERAGE_SKIP=1` 只跳过覆盖率，整体跳过使用 `git push --no-verify`。

## 自举开发

本仓库现在也是自己的 OpenSpec 项目，用插件本身管理自己的变更：

- OpenSpec 根：`openspec/`；流程技能由插件 provider 提供，仓库不再保存副本；项目说明：[AGENTS.md](AGENTS.md)。
- 新变更：`./node_modules/.bin/openspec new change <name>`，或插件安装后的 `openspec_new_change`。
- apply：按 `openspec-apply-change` 技能走 `openspec_apply_next` → 按批 `openspec_mark_task_done`。
- 收尾：`openspec_validate` 传 `strict: true`，并跑 `npm test` 与 `npm run openspec:check`。
- 归档：`openspec_archive`，只在用户明确要求时。

`openspec/` 与 `.dsh/` 是项目文件，不在本包 `files` 列表中，不会进入打包产物；`.dsh/skills/` 已移除，本仓库不再保存技能副本。

## 仓库与推送

远端为 `git@github.com:resec/dsh-openspec-flow.git`，远端名为 `origin`；`main` 跟踪 `origin/main`。

发布顺序：

1. 变更的全部任务完成，`openspec_validate` 传 `strict: true`、`npm test` 与 `npm run openspec:check` 通过。
2. `openspec_archive <name>` 归档：变更移入 `openspec/changes/archive/`，delta specs 并入 `openspec/specs/`。
3. 提交归档结果、文档更新与合并后的 specs。
4. 推送到 `origin/main`。

## 限制

- CLI 固定为 `@fission-ai/openspec` 1.16.1；升级 OpenSpec 需要发布新插件。
- 只支持 CLI 内置的 `spec-driven` schema。自定义 schema，或项目、用户目录中同名覆盖 `spec-driven` 的 schema，都会被 change 作用域的工具拒绝；`openspec_schemas` 不列出这些 schema，`openspec_new_change` 在写入前拒绝创建。
- 五份技能正文与 OpenSpec 1.16.1 对齐；升级 CLI 需要重新核对每个命令引用。
- 项目内残留的其他官方技能会被 provider 的 rank 50 覆盖；`openspec-sync-specs` 已不再提供，残留副本不会被覆盖，必须删除。
- store 模式会透传 `--store`，但端到端未在本机验证（本机无 store fixture）。
- 缓存是进程内的派生视图，跨进程不持久；DSH 重启后第一次 mark 会重跑一次 apply 取数。
- 文件写入是直接覆盖，不是原子替换。
- Windows 下通过 `process.execPath` 运行插件自带的 JS 入口，未在 Windows 实机验证。
- 流程规则只识别当前工作目录下的本地 `openspec/` 根，不解析 store 声明；store 模式的项目不会获得该规则。
- 规则是提示层约束，不阻止任何工具调用。

## 文件

```text
index.js                 插件入口、Config、注册 tools + skill provider + policy
lib/tools/index.js       工具注册入口
lib/tools/query.js       list、status、show、instructions、context、schemas、store_list、validate
lib/tools/apply.js       apply_next、mark_task_done
lib/tools/write.js       new_change、archive
lib/tools/shared.js      共享 schema 与参数校验
lib/init.js              init 工具、init --tools none、项目结构创建
lib/skills.js            打包技能的路径、frontmatter 解析、版本常量
lib/state.js             apply 载荷缓存、投影、mark 逻辑、指令映射
lib/schema.js            内置 spec-driven 闸门与覆盖检测
lib/tasks.js             任务行解析、编号、翻转、寻址
lib/openspec.js          CLI 解析、subprocess 调用、JSON 解析
lib/skill.js             skill provider 注册与按需读取
lib/policy.js            流程规则文本、项目检测、agent 作用域注册
lib/cache.js             进程内 LRU
lib/hash.js              SHA-1 指纹
skills/                  五份流程技能
locale/{en,zh}.json      Plugin Manager 标题与描述
icon.svg                 插件图标
test/                    单元与真实 CLI 集成测试
```

## 许可

MIT。
