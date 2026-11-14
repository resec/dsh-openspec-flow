# dsh-openspec-flow

DeepSeek Harness 的 OpenSpec 全流程插件。agent 通过 9 个 `openspec_*` 工具完成 propose、new、inspect、draft review、apply、archive 与 init，不再手敲 `openspec` 命令。OpenSpec CLI 仍是 schema、root、store、校验与归档语义的权威，由插件在内部调用。其中 6 个工具属于核心变更流程并默认暴露，3 个管理工具只在用户运行 `/opsx-admin` 后对当次回合暴露。

## 能力

| 分组 | 工具 | 作用 |
| --- | --- | --- |
| 读 | `openspec_inspect` | 单一读入口；`action` 选择 `list`（`specs: true` 列能力规格）、`status`、`show`、`instructions`、`context` 或 `validate` |
| 管理 | `openspec_schemas` | 列出插件支持的 schema；仅内置 `spec-driven`；管理块，`/opsx-admin` 后可见 |
| 管理 | `openspec_store_list` | 列出已注册 store；管理块，`/opsx-admin` 后可见 |
| 写 | `openspec_new_change` | 创建变更目录与 `.openspec.yaml`；先检查项目 schema，不支持则拒绝 |
| 写 | `openspec_archive` | 先校验、再归档并合并 delta specs |
| 管理 | `openspec_init` | 建 OpenSpec 项目结构与目录，不写技能；管理块，`/opsx-admin` 后可见 |
| apply | `openspec_apply_next` | 一次取 apply 状态、下一任务、contextFiles、指令与项目 `context`/`guidance` |
| apply | `openspec_mark_task_done` | 一次翻转一批任务的复选框，返回逐项状态、新进度与下一任务 |
| 评审 | `openspec_review` | draft review 与 apply review：`action` 选择 `start`、`wait`、`status`、`self-report`、`report`、`dispose`、`waive`、`retry`、`replace`、`waive-reviewer`、`extend` 或 `abandon`；`review` 选择 `draft` 或 `apply` |
| 评审者 | `openspec_reviewer` | 只由 `openspec-reviewer` preset 暴露：`read`、`submit`、`status`；changer 目录中不可见 |

写操作都有前置检查：`openspec_new_change` 与 `openspec_archive` 拒绝隐式创建根；`openspec_apply_next` 在 draft review 未就绪时拒绝；`openspec_archive` 在 apply review 启用且项目有 git、但评审未就绪时拒绝；`openspec_new_change` 在写入前拒绝非内置 schema 或同名覆盖；`openspec_archive` 在任务未完成或校验失败时不动文件；`openspec_init` 不覆盖已有配置，也不写技能文件。

`openspec/config.yaml` 的 `context`、`rules` 与 `operations.apply|archive.guidance` 由对应工具结果返回；未配置时省略。`openspec_inspect` 的 `action: "instructions"` 配合 `artifact: "archive"` 返回归档 `context`/`guidance`，不是空的产物字段。

## 管理块

核心变更流程的 6 个工具与 5 条技能默认对模型可见；管理块 3 个工具（`openspec_schemas`、`openspec_store_list`、`openspec_init`）默认既不出现也不可调用。用户运行命令后才对当次回合暴露：

- `/opsx-admin <意图>`：打开管理块，并把意图作为当次请求提交；该回合结束（agent 回到 idle）自动关闭。
- `/opsx-admin off`：提前关闭。
- 命令不带参数时返回用法错误，不会留下一个等后续消息使用的开口。
- 模型没有打开管理块的入口；管理工具关闭时按未知工具失败。
- 宿主没有命令注册表时，三个工具保持常驻并记一条警告，避免能力永久不可达。
- 打开与关闭会改变请求的工具目录，触发一次提示缓存前缀失效；管理操作日常很少使用，因此默认不暴露。

管理块不写入会话日志，恢复或分叉的会话总是从关闭状态开始。

## 流程覆盖

Agent 工作流全部由插件技能与工具覆盖。

| 流程 | 入口 | 说明 |
| --- | --- | --- |
| 探索与读取 | `openspec-explore`；`openspec_inspect`（`action: "list"`、`"status"`、`"show"`、`"context"`） | 只读，不写项目文件 |
| 提案 | `openspec-propose`；`openspec_new_change`、`openspec_inspect`（`action: "instructions"`、`"validate"`）、`openspec_review`（`action: "start"`、`"self-report"`） | 创建 change，写 proposal、specs、design、tasks，并完成 draft review |
| 实施 | `openspec-apply-change`；`openspec_apply_next`、`openspec_mark_task_done`、`openspec_review`（`review: "apply"`） | 紧凑 apply 循环；批量翻转任务；提交后完成 apply review |
| 修订规划 | `openspec-update-change`；`openspec_inspect`（`action: "instructions"`、`"validate"`） | 修改现有 artifacts；没有专用写工具 |
| 归档 | `openspec-archive-change`；`openspec_inspect`（`action: "instructions"`）、`openspec_review`（`review: "apply"`）、`openspec_archive` | 先读归档 `context`/`guidance`、检查 apply review、校验、检查任务，再移动并合并 delta specs |
| 管理 | `/opsx-admin`；`openspec_init`、`openspec_store_list`、`openspec_schemas` | 项目初始化、store 与 schema 查询；默认不暴露，用户命令开启一次回合 |
| 评审记录 | `openspec_review` | 记录在 `openspec/.review/<store>#<change>/`，`openspec/.gitignore` 忽略 `.review/` |

## 评审

变更在实施前与归档前各过一次评审；draft review 始终是强制闸门，apply review 在启用且项目有 git 时是强制闸门：

- **draft review** 审 planning 工件（proposal、delta specs、design、tasks）与本次意图；未就绪时 `openspec_apply_next` 拒绝。
- **apply review** 审已提交的 git tree 与变更工件是否一致；当 apply review 启用且项目有 git 时，未就绪会让 `openspec_archive` 拒绝。

每个评审段的 `reviewers` 决定评审方式：`0` 由 changer 用 `openspec_review` 的 `action: "self-report"` 自评；`1` 由插件启动一个只读的 `openspec-reviewer` 子会话，它只能通过 `openspec_reviewer` 读 brief 并提交报告。评审策略在 `openspec_new_change` 时锁定，包含 reviewer 模型（`inherit` 或显式 provider/model/effort）与轮次、等待上限；之后修改配置只影响新变更。没有 git 的项目在锁定策略时忽略 `reviews.apply.enabled`，把新策略的 apply 段关闭；旧策略可能仍记录启用，随后由 `openspec_review` 的 apply status 报告 `policy`/`enabled`/`available`，归档不等待不可用、无策略或禁用的评审。

就绪度不是报告的 `verdict` 本身：对象哈希必须未变、最新报告为 `pass`、且没有未关闭的 finding（`critical`/`major` 不能 deferred 或 rejected，用户 `waive` 需显式批准）。完整说明、记录布局、失败处理与两个端到端示例见 [docs/review.md](docs/review.md)。

## CLI 对照

对照对象为插件内置的 OpenSpec 1.16.1 CLI 与插件注册的 9 个工具。命令与选项清单来自 [tag v1.16.1 的 CLI 参考](https://github.com/Fission-AI/OpenSpec/blob/v1.16.1/docs-lab/reference/cli.md)，并以本机 `openspec --help` 逐条核对；参考文件按 tag 固定，不随上游文档变化。已废弃的 `openspec change` 与 `openspec spec` 不在对照范围内；「不支持」表示插件没有对应工具，命令仍可在终端执行。

「命令性质」按读写对象标注：`规格读` 读取变更、主规格或生成它们所需的工作流元数据；`规格写` 创建变更内容，或写入、移动主规格与变更目录；`Store 管理` 管理本机 store 注册与 store 目录；`Workset 管理` 管理本机个人工作视图；`OpenSpec 管理` 管理项目初始化、工具集成、全局配置、schema 定义、CLI 版本检查/安装/补全/反馈；`只读诊断` 只读根、store 引用或工作上下文。分组命令（`config`、`schema`、`store`、`workset`、`completion`）按域标注，不拆分读写子命令；`context --code-workspace` 是唯一会写文件的例外。这里的「只读」指不写规格内容，不代表 CLI 进程没有任何 I/O。

| CLI 命令 | 作用 | 命令性质 | 插件支持 | 对应工具与差异 |
| --- | --- | --- | --- | --- |
| `init` | 初始化项目结构 | OpenSpec 管理 | 部分支持 | `openspec_init` 固定执行 `init --tools none --no-animation`，只接受 `path`；不暴露 `--tools`、`--language`、`--force`、`--profile`；已有 `config.yaml` 时跳过；管理块，`/opsx-admin` 后可见 |
| `update` | 刷新已安装的指令文件 | OpenSpec 管理 | 不支持 | 技能由插件 skill provider 提供，随插件版本生效；升级插件后重启会话即可 |
| `config` | 全局配置 | OpenSpec 管理 | 不支持 | `path`、`list`、`get`、`set`、`unset`、`reset`、`edit`、`profile` 均未封装 |
| `list` | 列出变更或规格 | 规格读 | 部分支持 | `openspec_inspect`（`action: "list"`）：`specs` 对应 `--specs`，`store` 对应 `--store`；不暴露 `--archived`、`--all`、`--sort` |
| `show` | 打印变更或规格 | 规格读 | 部分支持 | `openspec_inspect`（`action: "show"`）：`name`、`type`、`noScenarios`、`store`，返回结构化投影；不暴露 `--deltas-only`、`--requirements`、`--diff`、`--requirement`、`--no-interactive` |
| `view` | 交互式仪表盘 | 规格读 | 不支持 | 终端 UI，无等价工具 |
| `validate` | 结构与任务校验 | 规格读 | 部分支持 | `openspec_inspect`（`action: "validate"`）：`change`、`spec`、`specs`、`all` 四种 scope，另有 `strict`、`store`；不暴露 `--archived`、`--report`、`--changes`、`--concurrency` |
| `archive` | 归档并合并 delta 规格 | 规格写 | 部分支持 | `openspec_archive`：`skipSpecs` 对应 `--skip-specs`，`store` 透传；固定 `--yes --json`，归档前先跑一次 `validate`；不暴露 `--no-validate` |
| `new change` | 创建变更目录 | 规格写 | 部分支持 | `openspec_new_change`：`name`、`description`、`goal`、`store`；`--schema` 固定为内置 `spec-driven` |
| `status` | 产物完成状态 | 规格读 | 部分支持 | `openspec_inspect`（`action: "status"`）：`change`、`store`；不暴露 `--all`、`--schema` |
| `instructions` | 产物与 apply 指令 | 规格读 | 部分支持 | `openspec_inspect`（`action: "instructions"`）覆盖 `proposal`、`specs`、`design`、`tasks`、`archive`；产物结果带项目 `context` 与 `rules`，`archive` 返回归档 `context`/`guidance`；`apply` 由 `openspec_apply_next` 承载并带 apply `context`/`guidance`；不暴露 `--schema` |
| `templates` | 产物模板路径 | 规格读 | 不支持 | 无工具；`openspec_inspect`（`action: "instructions"`）返回的 `outputPath` 已给出写入位置 |
| `schemas` | 列出工作流 schema | 规格读 | 部分支持 | `openspec_schemas` 只保留包内置 `spec-driven`，其余被过滤；`store` 透传；管理块，`/opsx-admin` 后可见 |
| `schema` | schema 检查与派生 | OpenSpec 管理 | 不支持 | `which`、`validate`、`fork`、`init` 均未封装；自定义 schema 会被闸门拒绝 |
| `store` | store 管理 | Store 管理 | 部分支持 | 仅 `openspec_store_list` 对应 `store list --json`；`setup`、`register`、`unregister`、`remove`、`store doctor` 不支持；管理块，`/opsx-admin` 后可见 |
| `doctor` | 根关系健康检查 | 只读诊断 | 不支持 | 无工具 |
| `context` | 工作上下文 | 只读诊断（可选写） | 部分支持 | `openspec_inspect`（`action: "context"`）：root（含 store_id）、被引用 store（fetch 为工具动作）、诊断（含 code/fix）；不暴露 `--code-workspace`、`--force` |
| `workset` | 个人工作视图 | Workset 管理 | 不支持 | `create`、`list`、`open`、`remove` 均未封装 |
| `version` | 版本与更新检查 | OpenSpec 管理 | 不支持 | 版本由依赖与 `engines` 固定，无工具 |
| `install` | 安装独立二进制 | OpenSpec 管理 | 不支持 | 机器级安装，与插件无关 |
| `feedback` | 提交反馈 | OpenSpec 管理 | 不支持 | 无工具 |
| `completion` | shell 补全 | OpenSpec 管理 | 不支持 | 无工具 |

## 官方技能对照

对照对象为 [tag v1.16.1 的 Skills 参考](https://github.com/Fission-AI/OpenSpec/blob/v1.16.1/docs-lab/reference/skills.md) 列出的 12 份技能（Core 6、Optional 6）。插件重写 Core 中的 5 份，正文把命令替换为 `openspec_*` 工具调用，frontmatter 记录 `metadata.upstream: openspec@1.16.1`；未提供的技能不随插件分发。

| 官方技能 | 官方类型 | 插件处理 | 说明 |
| --- | --- | --- | --- |
| `openspec-explore` | Core | 提供，已重写 | 只读探索；先过滤概览，再全读相关 spec（含 scenarios）；使用 `openspec_inspect` 的 `list`、`status`、`show`、`context` action |
| `openspec-propose` | Core | 提供，已重写 | 先读相关现有 specs 并暴露冲突；`openspec_new_change` 建变更，逐产物调 `openspec_inspect`（`action: "instructions"`）写文件，最后 `openspec_inspect`（`action: "validate"`） |
| `openspec-apply-change` | Core | 提供，已重写 | `openspec_apply_next` 取一次状态与下一任务，之后按批 `openspec_mark_task_done` |
| `openspec-update-change` | Core | 提供，已重写 | 只改已存在的规划产物；没有专用写工具，文件由 agent 直接编辑 |
| `openspec-sync-specs` | Core | 不提供 | delta 规格只在 `openspec_archive` 时合并；插件无「只同步不归档」流程 |
| `openspec-archive-change` | Core | 提供，已重写 | 先读归档 `context`/`guidance`、查任务与 `openspec_inspect`（`action: "validate"`），再调 `openspec_archive` |
| `openspec-new-change` | Optional | 不提供技能 | 创建动作由 `openspec_new_change` 工具承担，`openspec-propose` 内含该步骤 |
| `openspec-continue-change` | Optional | 不提供 | 由 `openspec_inspect`（`action: "status"`）判定下一个待办产物、`openspec_inspect`（`action: "instructions"`）给指令，但没有单产物推进的技能封装 |
| `openspec-ff-change` | Optional | 不提供 | 无独立技能；`openspec-propose` 已一次写完全部产物，对内置 schema 效果等价 |
| `openspec-verify-change` | Optional | 不提供 | 无 verify 工具；结构检查用 `openspec_inspect`（`action: "validate"`），实现与计划的对照需人工复核 |
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

- `dsh`：`=0.2.2-rc.2`。只接受该 DSH 运行时；其他版本在安装或 profile 启动检查时被拒绝，除非 profile 的 `compatibility.json` 中有针对该精确版本的豁免。DSH 仍处 alpha，逐个版本验证后再调整。
- `node`：`>=24.9.0`。与 DSH 0.2.2-rc.2 的 Node 下限一致；插件与 DSH 同进程运行，不单独支持更低的 Node。

升级 `engines.dsh` 的检查、候选运行时验证与回滚步骤见 [docs/upgrading-dsh-runtime.md](docs/upgrading-dsh-runtime.md)。

版本不匹配时 DSH 会跳过整个 bundle：工具、技能与流程规则都不会注册，stderr 输出 `dsh: skipping profile bundle "dsh-openspec-flow": ...`。

### 测试运行时

测试和覆盖率只允许运行在 Node 24 上，且具体版本必须满足 `engines.node`。大版本 24 对齐 DSH 0.2.2-rc.2 的 `PRIMARY_NODE_VERSION`。

命令只检查当前 `PATH` 上的 `node`，不会调用 fnm、nvm、volta，也不读取 `.nvmrc`。如果当前 `node` 不是 24，或具体版本低于 `>=24.9.0`，命令会在测试启动前报错退出。本机默认 `node` 可能是 26，运行前需手动激活 Node 24。

## 不变量

跨 capability 的取值只在 `project-invariants` capability 中声明一次：Node 主版本与 `engines.node` 下界、OpenSpec CLI 精确版本与 schema 信封版本、覆盖率下限。归档后该 capability 位于 `openspec/specs/project-invariants/spec.md`。

其他 spec 只引用该 capability，不重复取值。这条规则由评审执行，没有测试会在复述时失败。

## 配置

`cordis.patch.yml` 的 `config` 可覆盖：

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `timeoutMs` | `30000` | 单次 CLI 调用的墙钟上限，1000–300000。 |
| `reviews.draft.enabled` | `true` | 新 change 是否锁定 draft review。 |
| `reviews.draft.reviewers` | `0` | 0 为 changer 自评审，1 为独立 reviewer。 |
| `reviews.draft.maxRounds` | `3` | draft review 的默认轮次上限，1–50。 |
| `reviews.draft.waitMinutes` | `15` | draft review 的默认等待上限，1–120。 |
| `reviews.draft.reviewerModel` | `{ source: "inherit" }` | reviewer 模型：`inherit` 在锁定 policy 时解析为执行变更的模型；`explicit` 需 `provider` 与 `model`，模型有可选努力时还需 `reasoningEffort`。 |
| `reviews.apply.enabled` | `true` | 新 change 是否锁定 apply review；非 git 项目忽略该值并锁定关闭，旧策略可能仍记录启用但 status 报告不可用。 |
| `reviews.apply.reviewers` | `0` | 0 为 changer 自评审，1 为独立 reviewer。 |
| `reviews.apply.maxRounds` | `5` | apply review 的默认轮次上限，1–50。 |
| `reviews.apply.waitMinutes` | `15` | apply review 的默认等待上限，1–120。 |
| `reviews.apply.reviewerModel` | `{ source: "inherit" }` | 同 `reviews.draft.reviewerModel`，锁定到 apply review 的 policy。 |

CLI 来源固定：

- 只运行插件安装树内的 `@fission-ai/openspec`，精确版本 `1.16.1`；不读取 `PATH`、项目本地 `node_modules/.bin/openspec` 或 `cliPath`。
- 首次 CLI 调用执行 `openspec version --json`，要求 `version` 为 `1.16.1` 且 `schemaVersion` 为 `1`；不匹配时在运行目标命令前失败。
- 安装树缺少 CLI 时提示重装插件。旧配置中的 `cliPath` 会被配置校验拒绝。

## 评审配置页

profile 里的 `reviews` 可以在 Web GUI 的插件配置页里编辑，不需要改 `cordis.patch.yml`：Plugins → `dsh-openspec-flow` 行 → Configure，打开 `dsh-openspec-flow#openspec-flow` 这一页。

页面分 draft 与 apply 两段，字段为 enabled、reviewers（0/1）、maxRounds、waitMinutes 与 reviewer 模型。模型有两种来源：

- `inherit`：新 change 锁定 policy 时解析执行变更的模型（先 `agentDefaultModel`，再当前 agent 的模型），把 provider、model 与 effort 写进 `openspec/.review/<store>#<change>/policy.json`；解析不到时拒绝创建 change。
- `explicit`：provider 与 model 必填；模型暴露可选努力时 effort 必填，否则省略并按适配器默认。

保存分两阶段校验：先按 Config schema 校验完整候选（形状与上下界），再用 `llm` 目录校验 provider、model 与 effort；两次都通过才调用 `configEditor.edit` 写入 profile。被拒绝时不改文件并把原因返回页面。保存成功后该插件行会重启，已锁定 change 的 policy 不受影响。

页面数据来自插件自己的 `/openspec-review` 通道（注册在 `webServer` 的 prefix 路由上，由 `connection.admit` 施加与平台 API 相同的 Host/Origin 与 cookie 校验），端点与错误包络在 `lib/client/channel.js` 里声明一次：

| 方法 | 端点 | 作用 |
| --- | --- | --- |
| `reviewModels.providers` | `reviewModels/providers` | 已注册的 LLM provider |
| `reviewModels.models` | `reviewModels/models` | 某 provider 的模型 |
| `reviewModels.efforts` | `reviewModels/efforts` | 某 provider/model 的可选努力与默认努力 |
| `reviewSettings.get` | `reviewSettings/get` | 当前 draft/apply 设置、字段上下界、是否可保存 |
| `reviewSettings.update` | `reviewSettings/update` | 校验并保存完整候选 |
| `reviewPolicies.list` | `reviewPolicies/list` | 当前活动 agent 所在 OpenSpec 项目的锁定策略摘要 |

模型目录按端点缓存 60 秒；查询失败返回错误并保留上一次的值。`reviewPolicies.list` 只读取 `policy.json`，不返回 review 记录、报告或 finding；项目来自活动 agent 的工作目录（向上找到含 `openspec/` 的目录），去重后按路径排序。无 git 的项目在该项目下标注“应用评审不可用”，draft 设置不受影响。

客户端半个是手写的 loader bundle（`client.js`，`dsh.client` 声明、`./client` 导出），不需要构建步骤，也不引入新依赖；页面文案经 Client locale 服务注册（命名空间 `openspecReview`）。

## 设计要点

- **CLI 是权威**：schema、store、root、产物状态、校验与归档合并全部来自 `openspec`；插件不重新实现这些语义。
- **CLI 唯一内置**：只运行插件安装树内的 `@fission-ai/openspec` 1.16.1，首次调用校验版本，同一进程内缓存结果。
- **工具投影**：每个读工具返回 CLI JSON 的紧凑投影，保留下一步需要的字段，去掉内部结构。
- **路径基准**：项目内路径相对 `root.path`，根自身用 `.`，分隔符统一为 `/`；含相对路径的响应同时返回绝对 `root.path`，`openspec_apply_next` 与 `openspec_archive` 携带它。根外路径（store 根与元数据、根外 planning home）保持绝对；`openspec_init.root` 保持绝对。`openspec_mark_task_done` 不重复携带根，其 `next.sourcePath` 相对 `openspec_apply_next` 的 `root.path`，并接受相对 `sourcePath` 输入。
- **schema 闸门**：change 作用域的工具只接受内置 `spec-driven`；项目或用户目录中的同名覆盖会被拒绝。
- **指令映射**：`openspec_inspect`（`action: "instructions"`）返回的正文里，已知 CLI 命令片段被替换为对应的 inspect 调用与 action，路径保持不变。
- **一次取数**：`openspec_apply_next` 执行一次 `instructions apply --json`，把完整载荷留在进程内，只向模型返回投影。
- **每批 O(1)**：`openspec_mark_task_done` 先解析整批 id 并逐行翻转目标复选框，任一 id 缺失则整批不写；进度按缓存增量更新，下一任务从缓存任务表选取。
- **写操作可恢复**：`openspec_archive` 先校验后移动；`openspec_init` 只在缺少配置时创建目录，不覆盖已有配置。
- **评审先于实施**：`openspec_new_change` 先锁定 review policy；draft review 的工件哈希、finding 与 readiness 决定 `openspec_apply_next` 是否放行；apply review 的 tree 哈希决定 `openspec_archive` 是否放行；评审记录在 `openspec/.review/` 并由 `openspec/.gitignore` 忽略。
- **按项目注入规则**：流程规则通过 agent 自己的 context 注册为作用域内 system prompt 段；非 OpenSpec 项目返回空文本。

## 真实模型评测

评测 harness 已迁至独立仓库 `dsh-openspec-flow-eval`，该仓库包含 harness 规格、夹具、离线测试与覆盖率门禁。本仓库不再包含 `eval/`，也不再提供 `eval:*` 命令。

## 验证

在 OpenSpec 1.16.1、本机 DSH 0.2.2-rc.2、Node 24.22.2 上：

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
- 收尾：`openspec_inspect`（`action: "validate"`）传 `strict: true`，并跑 `npm test` 与 `npm run openspec:check`。
- 归档：`openspec_archive`，只在用户明确要求时。

`openspec/` 与 `.dsh/` 是项目文件，不在本包 `files` 列表中，不会进入打包产物；`.dsh/skills/` 已移除，本仓库不再保存技能副本。

## 仓库与推送

远端为 `git@github.com:resec/dsh-openspec-flow.git`，远端名为 `origin`；`main` 跟踪 `origin/main`。

发布顺序：

1. 变更的全部任务完成，`openspec_inspect`（`action: "validate"`）传 `strict: true`、`npm test` 与 `npm run openspec:check` 通过。
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
- 评审配置页只在同时挂载 `connection` 与 `webServer` 的 profile（Web/Desktop）出现；headless profile 仍保留全部工具，只是没有配置页。
- 页面标题与按钮文案依赖 `plugins.row.config` 槽位；Plugin Manager 未启用时看不到 Configure 入口。

## 文件

```text
index.js                 插件入口、注册 tools + skill provider + policy + review 通道
lib/tools/index.js       工具注册入口
lib/tools/query.js       list、status、show、instructions、context、schemas、store_list、validate
lib/tools/apply.js       apply_next、mark_task_done
lib/tools/write.js       new_change、archive
lib/tools/review.js      draft review 工具与 apply 闸门
lib/review/              评审存储、policy、工件哈希、brief、报告、readiness 与 reviewer 工具
lib/review/model.js      reviewer 模型解析、策略锁定与目录可用性校验
lib/review/settings.js   /openspec-review 通道：模型目录、设置读写、锁定策略与项目事实
lib/client/channel.js    通道路径、端点名与错误包络（两端共享声明）
lib/config.js            行 Config 的 Standard Schema（同步、纯形状校验）
client.js                Web GUI 评审配置页（手写 loader bundle，dsh.client）
reviewer.js              openspec-reviewer preset 的 Host 入口
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
docs/review.md           评审系统完整说明（不进入发布包）
test/                    单元与真实 CLI 集成测试
```

## 许可

MIT。
