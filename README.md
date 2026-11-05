# dsh-openspec-flow

DeepSeek Harness 的 OpenSpec 流程插件。它把 apply 阶段「每完成一个任务就重跑一次 `openspec instructions apply --json`」的做法，改成「一次取紧凑状态 + 每任务一次小结果」，OpenSpec CLI 仍是 schema、root、store 与进度的权威。

本插件基于工作区三份报告实现：

- `openspec-token-cost-analysis.md`：重复查询是 apply 阶段的主导开销，且 39 任务的单次载荷 14.3 KB 已越过 DSH 工具结果裁剪阈值。
- `openspec-mark-task-done-port-report.md`：`mark-task-done` 的移植蓝图，返回体应带 `nextPendingId` 与 `progress`。
- `openspec-dsh-support.md`：官方支持是 skills-only；插件的新增价值在工具层与入口形态。

## 能力

| 工具 | 作用 | 结果量级（39 任务实测） |
| --- | --- | --- |
| `openspec_list` | 列出变更与任务计数，判断当前目录是否 OpenSpec 项目 | 数百字节 |
| `openspec_status` | 紧凑状态：schema、产物完成度、下一步、编辑约束 | 约 1 KB |
| `openspec_apply_next` | 一次取 apply 状态：进度、下一任务、`contextFiles`、CLI 指令 | 863 B |
| `openspec_mark_task_done` | 翻转一个复选框并返回新进度与下一任务 | 平均 394 B |
| `openspec_validate` | 紧凑校验结果 | 数百字节 |

插件还会为 OpenSpec 项目的 agent 注入一段常驻系统提示规则（`openspec-flow:policy`）。规则只在该 agent 当前工作目录存在 `openspec/` 根时出现；其他项目不注册、不注入，切换目录后规则随之出现或消失。规则是提示层约束，不拦截任何工具调用。

同时注册技能 `openspec-flow`（模型可加载，也可由用户执行 `/openspec-flow`），说明上述工具的 apply 循环与暂停条件。技能名与上游 `openspec-apply-change` 不同，因此不会争抢同名条目；运行时技能 rank 为 250，压不过项目 `.dsh/skills` 的 100，这是有意的：项目自带的 OpenSpec 技能仍然优先。

## 安装

在 DeepSeek Harness 中把本目录作为 bundle 安装：

```text
plugin_manager action=install_bundle target=/path/to/dsh-openspec-flow
```

安装后插件行 id 为 `openspec-flow`。本包是 Host-only bundle，无构建脚本、无 `@deepseek-ai/*` 运行时依赖；工具与技能都从 `index.js` 注册。安装时由包管理器安装 `@fission-ai/openspec` 1.16.0；以本地 linked 目录安装时，需要先在插件目录执行 `npm install`。

## 配置

`cordis.patch.yml` 的 `config` 可覆盖：

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `timeoutMs` | `30000` | 单次 CLI 调用的墙钟上限，1000–300000。 |

CLI 来源固定：

- 只运行插件安装树内的 `@fission-ai/openspec`，精确版本 `1.16.0`；不读取 `PATH`、项目本地 `node_modules/.bin/openspec` 或 `cliPath`。
- 首次 CLI 调用执行 `openspec version --json`，要求 `version` 为 `1.16.0` 且 `schemaVersion` 为 `1`；不匹配时在运行目标命令前失败。
- 安装树缺少 CLI 时提示重装插件。旧配置中的 `cliPath` 会被配置校验拒绝，不再静默忽略。

## 设计要点

- **CLI 是权威**：schema、store、root、产物状态、apply 指令全部来自 `openspec`；插件不重新实现 schema 解析与 root 选择。
- **CLI 唯一内置**：只运行插件安装树内的 `@fission-ai/openspec` 1.16.0，不读取 PATH、项目本地或配置覆盖；首次调用校验 `version --json`，同一进程内缓存校验结果。
- **schema 闸门**：只接受 CLI 内置的 `spec-driven`。项目或用户目录中的同名覆盖会被拒绝；`mark` 通过缓存指纹检测 schema 选择变化，避免绕过闸门。
- **一次取数**：`openspec_apply_next` 执行一次 `instructions apply --json`，把完整载荷留在进程内，只向模型返回投影。
- **每任务 O(1)**：`openspec_mark_task_done` 只翻转目标复选框，进度按缓存增量更新，下一任务从缓存任务表选取；39 任务循环中，首次之后不再启动 CLI。
- **失效检测**：缓存记录所有已知跟踪文件的 SHA-1。文件被外部修改时，下一次 mark 会重跑一次 CLI 再写，避免基于陈旧进度落盘。
- **字节保真**：按 `\n` 切分、按原行拼回，CRLF 的 `\r` 留在行尾；只替换复选框内的字符。UTF-8 与 BOM 不受影响。
- **精确寻址**：`1.1` 不会匹配 `1.10` 或 `1.1.1`；无编号任务用 `#N`（CLI 的 1 基序号）。行号与描述同时用于写入前核对。
- **无 shell 拼接**：CLI 参数以 argv 数组交给 subprocess 服务；change 名、store id 不经过 shell。
- **按项目注入规则**：流程规则通过 agent 自己的 context 注册为作用域内 system prompt 段；每次组装重新读取工作目录，非 OpenSpec 项目返回空文本，空段不进入提示。

## 验证

在 OpenSpec 1.16.0、本机 DSH 0.2.2-rc.1、Node 26 上：

- 单元 + 集成测试共 37 项通过（`node --test test/`），覆盖任务解析、`1.1`/`1.10`、CRLF、字节保真、blocked、外部编辑刷新、`#N` 寻址、内置 schema 闸门与自定义/覆盖 schema 拒绝，以及 CLI 唯一来源与版本校验。
- 39 任务变更：`instructions apply --json` 单次 13,664 B；本插件 `apply_next` 863 B，39 次 mark 平均 394 B，合计 16,226 B，约为「每任务重跑」53.3 万字节的 3.0%。
- 39 次 mark 期间 CLI 子进程启动次数为 0（测试断言），证明循环不再是 O(N²) 查询。
- 测试使用真实 `@fission-ai/openspec` 1.16.0，不是 mock。

复跑：

```text
cd dsh-openspec-flow
node --test test/
```

集成测试直接使用插件安装树内的 `@fission-ai/openspec`；不再依赖工作区 `.probe/npm-cache/_npx`。测试在 `os.tmpdir()` 内复制 fixture，不修改 `.probe/proj`。

## 自举开发

本仓库现在也是自己的 OpenSpec 项目，用插件本身管理自己的变更：

- OpenSpec 根：`openspec/`；项目技能：`.dsh/skills/openspec-*`；项目说明：[AGENTS.md](AGENTS.md)。
- CLI 是插件的运行时依赖（精确 1.16.0），与本项目 `node_modules` 中的副本相同。插件只运行自己的安装树，不查找 PATH 或项目本地；手动命令仍用 `./node_modules/.bin/openspec`。
- 新变更：`./node_modules/.bin/openspec new change <name>`，补齐 `proposal.md`、`specs/`、`design.md`、`tasks.md`。
- apply：显式调用 `/openspec-flow <name>`。项目里的上游 `openspec-apply-change` rank 更高，不显式指定时可能被选中；`openspec-flow` 会走 `openspec_apply_next` → 每任务 `openspec_mark_task_done` 的紧凑循环。
- 收尾：`./node_modules/.bin/openspec validate <name>` 与 `node --test test/`。
- 归档仍用上游 `openspec-archive-change` 流程。

`openspec/` 与 `.dsh/` 是项目文件，不在本包 `files` 列表中，不会进入打包产物。第一个自举变更 `adopt-openspec-workflow` 已归档到 `openspec/changes/archive/2026-11-05-adopt-openspec-workflow/`，其 delta 已合并到 `openspec/specs/development-workflow/spec.md`。

## 限制

- CLI 固定为 `@fission-ai/openspec` 1.16.0；升级 OpenSpec 需要发布新插件，不能通过项目本地、PATH 或配置覆盖。
- 只支持 CLI 内置的 `spec-driven` schema。自定义 schema，或项目、用户目录中同名覆盖 `spec-driven` 的 schema，都会被 `openspec_status`、`openspec_apply_next` 与 `openspec_validate` 拒绝；错误会给出覆盖路径或恢复动作。
- 只支持本地 repo 形态的 OpenSpec 项目；`--store` 会原样透传，但 store 模式的端到端未在本机验证（本机无 store fixture）。
- 不做 GUI 面板、不执行 `openspec init`、不生成 proposal/spec/design、不归档变更。这些仍走上游技能或 CLI。
- 缓存是进程内的派生视图，跨进程不持久；DSH 重启后第一次 mark 会重跑一次 apply 取数。
- 外部新增一个此前未被缓存的跟踪文件不会被哈希发现；下一次 `openspec_apply_next` 会刷新。多文件 `apply.tracks` 的已有文件会被哈希覆盖。
- 文件写入是直接覆盖，不是原子替换；需要原子性时应在上游或外层加保护。
- Windows 下通过 `process.execPath` 运行插件自带的 JS 入口，未在 Windows 实机验证。
- 本插件的技能不能覆盖项目级同名技能；项目里若已有 `openspec-flow`，项目版本胜出。
- 流程规则只识别当前工作目录下的本地 `openspec/` 根，不解析 store 声明或全局默认 store；store 模式的项目不会获得该规则。
- 规则是提示层约束，不阻止任何工具调用；要强制写入门禁需要额外的工具 guard。
- 技能目录仍全局可见：非 OpenSpec 项目仍会看到 `openspec-flow` 的技能描述，只是不会被注入规则。
- `Config` 是手写 Standard Schema：Cordis 用它校验行配置，但 Plugin Manager 的 Config 检查器无法把它投影成 JSON Schema，会显示 `unsupported`。这不影响插件激活与工具运行，配置项写在 bundle 行的 `config` 中即可。

## 文件

```text
index.js                 插件入口、Config、注册 tools + skill + policy
lib/tools.js             五个工具的定义、schema、参数校验
lib/state.js             apply 载荷缓存、投影、mark 逻辑
lib/schema.js            内置 spec-driven 闸门与覆盖检测
lib/tasks.js             任务行解析、编号、翻转、寻址
lib/openspec.js          CLI 解析、subprocess 调用、JSON 解析
lib/skill.js             技能文档解析与注册
lib/policy.js            流程规则文本、项目检测、agent 作用域注册
lib/cache.js             进程内 LRU
lib/hash.js              SHA-1 指纹
skills/openspec-flow/    技能正文
locale/{en,zh}.json      Plugin Manager 标题与描述
icon.svg                 插件图标
test/                    单元与真实 CLI 集成测试
```

## 许可

MIT。
