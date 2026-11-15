# 升级 OpenSpec CLI

本文档面向维护者，说明把 `dsh-openspec-flow` 的 `@fission-ai/openspec` 精确依赖从一个版本升到另一个版本时，需要检查什么、改哪些文件、跑哪些测试，以及如何发布和回滚。

当前基线（2026-11-12 工作树）：

- CLI：`@fission-ai/openspec` 1.16.1（`package.json:55`）
- Node：`>=24.9.0`（`package.json` 的 `engines.node`）
- DSH：`=0.2.2-rc.2`（`package.json` 的 `engines.dsh`）
- 插件版本：0.4.0（`package.json:3`）

插件只运行自己安装树内的 CLI（`lib/openspec.js:106`），首次调用校验精确版本与 `schemaVersion: 1`（`lib/openspec.js:143`）。因此升级必须同时移动依赖、版本断言与文档，不能只改 `package.json`。

## 适用范围

适用于以下情况：

- 把 `dsh-openspec-flow` 的 `@fission-ai/openspec` 从一个精确版本升到另一个精确版本。
- 上游发布了新的 patch/minor，需要判断是否跟进。
- 上游修改了 CLI 的 JSON 输出、校验规则、指令文本或任务行解析。

不适用于：

- 项目自定义 schema 的兼容性判断。那部分结论见工作区根目录的 `openspec-cli-schema-compatibility.md`（2026-11-05）：CLI 版本不参与项目 schema 的版本协商，旧 CLI 会忽略新 schema 的未知字段。
- DSH 运行时升级。两者的版本字段不同，DSH 的升级规则见 `AGENTS.md` 的 Plugin constraints。

## 升级决策

### 读取上游变更

先读目标版本的 release notes 与 CHANGELOG，再决定是否升级：

- Release：`https://github.com/Fission-AI/OpenSpec/releases/tag/v<version>`
- CHANGELOG：`https://github.com/Fission-AI/OpenSpec/blob/main/CHANGELOG.md`

重点记录四类信息：

- **Breaking**：运行时要求、命令选项、输出结构的变化。Breaking 不保证提升 major。release notes 的 Breaking 段与 CHANGELOG 的分类可能不一致，两处都读。
- **行为变化**：`validate`、`archive`、`show`、`list` 的判定规则。例如未知的 delta section 可能从警告变为失败，带闭合 `#` 的标题可能从被忽略变为参与解析。
- **JSON 变化**：命令的 `--json` 输出字段。release notes 不保证逐字段列出，需用契约检查实测。
- **文本变化**：`instructions` 返回的指令正文、任务行解析规则、schema 解析顺序。这些不在 JSON shape 里，靠单测与人工核对。

### 核对运行时要求

```bash
npm view @fission-ai/openspec@<version> engines.node --json
```

如果本机 npm 缓存不可写（本机曾出现 `EACCES`），改用临时缓存：

```bash
npm_config_cache="$(mktemp -d)" npm view @fission-ai/openspec@<version> engines.node --json
```

`npm view` 对该字段返回单元素数组，例如 `[">=22.12.0"]`。

记录目标版本的 `engines.node`。插件与 DSH 同进程运行，实际 Node 由 DSH 决定；只有当目标 CLI 的下限高于插件当前 `engines.node` 时，才需要评估是否同步调整插件与 DSH 的 Node 下限。当前插件要求 Node 24，CLI 1.16.1 要求 `>=22.12.0`。

同时确认目标 CLI 的 `version --json` 仍输出 `schemaVersion: 1`。插件在 `lib/openspec.js:153` 硬性要求该值；它变化时插件会在运行任何目标命令前失败。

```bash
node node_modules/@fission-ai/openspec/bin/openspec.js version --json
```

### 判断升级类型

| 上游变化 | 对插件的影响 | 需要做的事 |
| --- | --- | --- |
| 仅帮助文本、日志、性能 | 无 | 改版本号、锁文件、断言、文档 |
| `--json` 字段改名、删除、类型变化 | 投影读不到字段，工具输出缺字段或报错 | 改 `lib/state.js` 与 `lib/tools/*` 的投影，补测试 |
| `validate` / `archive` 判定规则变化 | 投影不变，但用户项目的校验与归档结果变化 | 补行为测试，更新 README 的限制与升级说明 |
| `instructions` 正文变化 | 命令片段可能漏映射为工具名 | 改 `lib/state.js:800` 的映射表，补投影测试 |
| 任务行解析变化 | 插件与 CLI 对任务数量、完成状态不一致 | 改 `lib/tasks.js:20` 的正则与测试 |
| schema 解析顺序或目录变化 | 内置 `spec-driven` 闸门可能误判 | 改 `lib/schema.js:35` 与相关测试 |
| Node 引擎下限提高 | 插件测试与 DSH 运行时可能不满足 | 评估 DSH 与插件的 `engines.node`，同步调整 |

## CLI 耦合面

行号基于当前工作树；升级后先用 `grep` 重新定位，再按表中的位置核对。

| 位置 | 依赖的内容 | 升级检查 |
| --- | --- | --- |
| `package.json:55` | 精确版本 `1.16.1` | 改为目标精确版本 |
| `lib/openspec.js:47` | 从 `package.json` 派生 `PINNED_CLI_VERSION` | 无需改代码，改 manifest 即生效 |
| `lib/openspec.js:143` | `version --json` 的 `version` 与 `schemaVersion` | 目标 CLI 必须仍输出 `schemaVersion: 1`，且 `version` 与 pin 完全一致 |
| `lib/openspec.js:351` | `runOpenSpec` 的 spawn 参数与 `--json` 解析 | 命令仍支持 `--json`，输出仍是单段 JSON |
| `lib/openspec.js:379` | `runOpenSpecCommand`（`init` 无 JSON） | `init` 仍无 `--json`，仍以退出码判定 |
| `lib/openspec.js:393` | CLI 错误载荷的 `status[].message` 与 `status[].fix` | 错误 JSON 形状不变 |
| `lib/openspec.js:413` | `throwIfOnlyStatus`（`status` 数组 + 无成功字段） | 成功载荷不会只带 `status` |
| `lib/state.js:101` | `instructions apply` 的必填字段与 `tasks[]` | `changeName`、`schemaName`、`state`、`progress`、`tasks` 仍在 |
| `lib/state.js:133` | apply 命令 `instructions apply --change ... --json` | 命令与选项仍存在 |
| `lib/state.js:555` | `status --json` 的 `changeName`、`schemaName`、`artifacts`、`actionContext` | 字段名与类型不变 |
| `lib/state.js:607` | `list --json` 的 `changes[]`、`root`、`status` | `completedTasks`、`totalTasks`、`status` 仍在 |
| `lib/state.js:633` | `list --specs --json` 的 `specs[]` | `id`、`requirementCount` 仍在 |
| `lib/state.js:657` | `context --json` 的 `root`、`members`、`status` | 字段不变 |
| `lib/state.js:676` | `schemas --json` 的数组元素 | `name`、`description`、`artifacts`、`source` 仍在 |
| `lib/state.js:697` | 只保留 `source: "package"` 的 `spec-driven` | `source` 的取值不变 |
| `lib/state.js:710` | `store list --json` 的 `stores[]` 与 `metadata_path` | 字段名不变 |
| `lib/state.js:729` | `show --json` 的 change/spec 两种形态 | `deltas[]` 与 `requirements[]` 的嵌套字段仍在 |
| `lib/state.js:800` | 指令正文中的 7 个 CLI 片段 | 目标版本的指令文本仍包含这些片段，或补新映射 |
| `lib/state.js:814` | `instructions <artifact> --json` 的字段 | `outputPath`、`resolvedOutputPath`、`instruction`、`dependencies`、`unlocks` 仍在 |
| `lib/state.js:859` | `validate --json` 的 `items[].issues[]` | `level`、`path`、`message` 仍在 |
| `lib/tasks.js:20` | 任务行正则，镜像 CLI 的 `task-progress` | 与目标 CLI 的解析规则一致 |
| `lib/schema.js:35` | 用户 schema 目录（XDG、Windows、`~/.local/share`） | 目录规则不变 |
| `lib/schema.js:115` | 内置 `spec-driven` 闸门与项目/用户覆盖检测 | 解析顺序与覆盖判定不变 |
| `lib/tools/query.js:107` | `list` / `list --specs` 的参数 | 选项仍存在 |
| `lib/tools/query.js:198` | `status --change ... --json` | 选项仍存在 |
| `lib/tools/query.js:271` | `instructions <artifact> --change ... --json` | 选项仍存在 |
| `lib/tools/query.js:413` | `show <name> --json` 与 `--type spec` | 选项仍存在 |
| `lib/tools/query.js:495` | `context --json` | 选项仍存在 |
| `lib/tools/query.js:556` | `schemas --json` | 选项仍存在 |
| `lib/tools/query.js:611` | `store list --json` | 选项仍存在 |
| `lib/tools/query.js:720` | `validate <change> --json [--strict]` | 选项仍存在 |
| `lib/tools/query.js:729` | `validate <spec> --type spec --json` | 选项仍存在 |
| `lib/tools/query.js:732` | `validate --specs` / `validate --all` | 选项仍存在 |
| `lib/tools/write.js:82` | `new change` 前的 `list --json` 探测 | 无 root 时 `root` 仍为 null |
| `lib/tools/write.js:93` | `new change ... --schema spec-driven --json` | `--schema`、`--description`、`--goal` 仍存在 |
| `lib/tools/write.js:186` | `archive` 前的 `list --json` 进度检查 | `totalTasks`、`completedTasks` 仍在 |
| `lib/tools/write.js:204` | `archive` 前的 `validate --json` | `items[].valid` 仍在 |
| `lib/tools/write.js:213` | `archive ... --yes --json` 与 `--skip-specs` | 选项仍存在 |
| `lib/init.js:76` | `init --tools none --no-animation` | 选项仍存在，仍不生成技能 |
| `skills/*/SKILL.md:7` | `metadata.upstream: openspec@1.16.1` | 改为目标版本 |
| `test/openspec.test.mjs:11` | 硬编码 `1.16.1` | 改为目标版本 |
| `test/skills.test.mjs` | 硬编码 `upstream: openspec@1.16.1` | 改为目标版本 |
| `README.md:64` | CLI 对照表的 v1.16.1 tag | 改为目标 tag，并重新核对命令与选项 |
| `README.md:95` | 官方技能对照表的 v1.16.1 tag | 改为目标 tag，并重新核对 12 份技能 |
| `README.md:181` | 精确版本与来源说明 | 更新版本号 |
| `README.md:182` | 版本闸门说明 | 更新版本号 |
| `README.md:214` | 设计要点中的版本 | 更新版本号 |
| `README.md:231` | 验证环境 | 更新版本号与实测数据 |
| `README.md:236` | 测试使用真实 CLI 的说明 | 更新版本号 |
| `README.md:285` | 限制：CLI 固定版本 | 更新版本号 |
| `README.md:287` | 限制：技能正文对齐 | 更新版本号 |
| `AGENTS.md:28` | 精确版本 | 更新版本号 |
| `cordis.patch.yml:3` | 注释中的精确版本 | 更新版本号 |
| `package-lock.json` | `@fission-ai/openspec` 的版本与 integrity | 用 `npm install` 更新，不手改 |

## 修改顺序

先跑契约检查，再改依赖。顺序反过来会让基线变成新版本，失去对比意义。

1. 运行契约检查，确认目标版本是否破坏插件消费的 JSON 字段：

   ```bash
   npm run contract:check -- --candidate <version>
   ```

   判断标准见“契约检查”一节。失败时先判断是 fixture 问题、清单过期，还是 CLI 真的改了字段。

2. 把 `package.json:55` 改为目标精确版本，不加 `^` 或 `~`。

3. 更新锁文件与安装树：

   ```bash
   npm install
   node -e "console.log(require('./node_modules/@fission-ai/openspec/package.json').version)"
   ```

   第二条命令应输出目标版本。

4. 改 `test/openspec.test.mjs:11` 的 `PINNED_CLI_VERSION` 断言。

5. 按契约检查结果改投影。涉及 `lib/state.js`、`lib/tools/query.js`、`lib/tools/write.js`、`lib/schema.js`、`lib/tasks.js`。每改一处，补一个回归测试。

6. 如果 `instructions` 正文变化，更新 `lib/state.js:800` 的 `INSTRUCTION_COMMAND_MAP`，并在 `test/projections.test.mjs` 的映射用例里补片段。

7. 如果任务行解析变化，更新 `lib/tasks.js:20` 与 `lib/tasks.js:24`，并在 `test/tasks.test.mjs` 补用例。

8. 更新五份 `skills/*/SKILL.md` 的 `metadata.upstream`。正文只应出现 `openspec_*` 工具名，不应出现 CLI 命令；`test/skills.test.mjs` 会拦截 CLI 提及。

9. 更新 `test/skills.test.mjs` 的 upstream 断言。

10. 更新 README 的两个对照表与版本说明。两个表的引用都按 tag 固定；升版本时把两处 `v1.16.1` 改为目标 tag，并按新 tag 的 CLI/skills 参考重新核对表格。若目标 tag 的官方技能清单有变化，同步调整“官方技能对照”。

11. 更新 `AGENTS.md:28` 与 `cordis.patch.yml:3` 的版本字样。

12. 更新本文档的基线、示例与来源。

## 测试矩阵

| 检查 | 命令 | 通过标准 |
| --- | --- | --- |
| 版本闸门与 CLI 解析 | `node --test test/openspec.test.mjs` | 全部通过 |
| 投影与状态 | `node --test test/projections.test.mjs test/state.test.mjs test/state-projections.test.mjs test/state-load.test.mjs` | 全部通过 |
| 任务行解析 | `node --test test/tasks.test.mjs` | 全部通过 |
| schema 闸门 | `node --test test/schema.test.mjs` | 全部通过 |
| 真实 CLI 集成 | `node --test test/integration.test.mjs` | 全部通过 |
| 工具与 CLI 字节对照 | `node --test test/e2e.test.mjs` | 归档后的 specs 与 tasks 逐字节一致 |
| 全量测试 | `npm test`（Node 24） | 全部通过 |
| 覆盖率门禁 | `npm run coverage:check`（Node 24） | 通过，不低于基线 |
| JSON 契约 | `npm run contract:check -- --candidate <version>` | 退出码 0 |
| 严格校验 | `npm run openspec:check`（Node 无需 24） | 退出码 0，活动 change 与主 specs 无警告 |
| OpenSpec 校验 | `openspec_inspect`（`action: "validate"`，`change` 参数，`strict: true`） | `valid: true` |

目标版本可能新增警告，例如更严的需求长度或场景步骤检查。新增警告属于升级改动的一部分：先修好受影响的工件，再让 `npm run openspec:check` 通过。

测试入口只接受 PATH 上的 Node 24，且具体版本满足 `>=24.9.0`；它不会调用 fnm、nvm、volta，也不读 `.nvmrc`。本机默认 Node 可能是 26，需先激活 Node 24：

```bash
export PATH="<Node 24 的 bin 目录>:$PATH"
node --version
npm test
```

示例中的 `<Node 24 的 bin 目录>` 换成所在机器的实际路径；入口的预检会在启动测试前拒绝非 24 或低于下限的版本。

负向检查至少覆盖以下场景：

- **版本不匹配**：保留旧 `node_modules`，只把 `package.json` 改为目标版本，`openspec_inspect`（`action: "status"`）应报 reported 与 pinned 不一致（`lib/openspec.js:159`），而不是继续执行。
- **schema 覆盖**：在项目创建 `openspec/schemas/spec-driven/schema.yaml`，change 作用域的 `openspec_inspect`（`action: "status"`、`action: "validate"`）与 `openspec_apply_next` 应拒绝（`lib/schema.js:128`）。
- **未知 delta section**：当前 pin 下 `validate` 失败、`archive` 拒绝。用候选 CLI 在 fixture 上验证；插件应在 `openspec_archive` 前置校验阶段返回 `valid: false`，且不移动文件（`lib/tools/write.js:200`）。
- **指令映射**：`test/projections.test.mjs` 的映射用例应确认输出中没有残留的 `` `openspec list` ``、`` `openspec show` ``、`` `openspec validate` `` 片段。

手工冒烟在自动测试之后：

1. 重启 DSH，确认 stderr 没有 `dsh: skipping profile bundle "dsh-openspec-flow"`。
2. 在一个 OpenSpec 项目依次调用 `openspec_inspect`（`action: "list"`、`"status"`、`"validate"`）、`openspec_apply_next`、`openspec_mark_task_done`。
3. 对一个已完成 change 调用 `openspec_archive`，确认归档目录、合并后的主 specs 与 `specsUpdated` 符合预期。
4. 检查工具输出中的 `schema`、`progress`、`instruction`、`issues` 仍是预期形状。

## 契约检查

### 作用

`scripts/check-cli-contract.mjs` 是开发期检查，不进入插件运行时，也不由 `npm test` 自动执行。它做三件事：

1. 用同一套 fixture 项目分别运行“当前锁定的 CLI”和“候选 CLI”，记录每条命令的 JSON shape。
2. 按 `scripts/cli-contract.json` 的字段清单，检查插件实际读取的字段在候选 CLI 中仍存在、类型未变。
3. 输出两个 CLI 的 shape 差异，新增字段也列出，便于人工判断。

它只比较结构，不比较值。形状由 `shapeOf` 定义：对象保留键集合，数组合并元素形状，标量保留 `typeof`；空数组没有元素形状，标记为“未观测”。

### 用法

```bash
# 从 npm 安装候选版本到临时目录，再与当前 pin 对比
npm run contract:check -- --candidate <version>

# 离线：候选 CLI 已经安装或解包在本地
npm run contract:check -- --candidate-bin /path/to/openspec/bin/openspec.js

# 显式指定基线（默认是插件安装树内的 CLI）
npm run contract:check -- --baseline-bin /path/to/old/bin/openspec.js --candidate-bin /path/to/new/bin/openspec.js

# 机器可读输出
npm run contract:check -- --candidate <version> --json
```

`--candidate` 使用 `npm install --prefix` 把候选版本装进临时目录，并让 npm 缓存也落在临时目录；不会改仓库的 `package.json`、`package-lock.json` 或 `node_modules`。离线或 npm 不可用时用 `--candidate-bin`。

退出码：

| 退出码 | 含义 |
| --- | --- |
| 0 | 消费字段全部存在且类型一致；新增字段只报告 |
| 1 | 有消费字段缺失、类型变化，或 setup/completed 命令失败 |
| 2 | 参数错误、CLI 安装失败、fixture 命令没有 JSON 等环境问题 |

### 输出解读

- `no shape change`：该命令的 JSON 结构在两个版本间一致。
- `+ path`：候选新增字段。通常安全，需判断是否要利用。
- `- path`：候选删除字段。若该字段在消费清单中，会同时出现 `FAIL`。
- `~ path (a -> b)`：类型变化。若该字段在消费清单中，会同时出现 `FAIL`。
- `FAIL <suite>/<command>: ...`：消费字段缺失或类型变化，或命令没有可解析 JSON。
- `warning: ... was not observed (empty fixture array)`：fixture 的数组为空，元素字段无法观测；不是失败，但说明该字段未被这次运行覆盖。

### 字段清单

字段清单在 `scripts/cli-contract.json`。每条命令包含：

- `id`：命令标识，必须唯一。
- `stage`：`setup`（`init`、`new change`）、`base`（其余读命令与 validate）、`completed`（`archive`）。
- `args`：argv 数组，支持 `{change}` 与 `{spec}` 占位符。
- `fields`：JSON 路径到类型的映射。类型为 `string`、`number`、`boolean`、`object`、`array`；可选字段写成 `{ "type": "...", "optional": true }`。

路径语法：

- `a.b`：对象键。
- `a.b[]`：数组元素再取键。
- `[].name`：顶层数组元素取键。

新增工具或新增读取字段时，同步更新清单。`test/cli-contract.test.mjs` 会校验清单的命令数、唯一 id、`args` 与 `fields` 结构；字段路径本身由契约检查在真实 CLI 输出上验证。

### 限制

- 只覆盖 JSON 结构，不覆盖 `validate` 规则、`archive` 合并、任务行解析、schema 解析、指令正文。
- fixture 是单个 repo-local 项目，没有 root、store、自定义 schema、Windows 路径等分支。
- `--candidate` 依赖 npm 与网络；受限环境用 `--candidate-bin`。
- 空数组元素只能报“未观测”，不能证明字段存在；需要时在 fixture 中增加对应数据，而不是放宽清单。

## 发布与回滚

发布顺序：

1. 所有任务完成，`openspec_inspect`（`action: "validate"`）传 `strict: true`、`npm test`、`npm run coverage:check`、`npm run openspec:check`、`npm run contract:check` 通过。
2. 升插件版本。`package.json` 的 `version` 决定技能 frontmatter 的 `dsh-openspec-flow@<version>`（`lib/skills.js:23`），`test/skills.test.mjs` 会校验两者一致；只升 CLI 而不升插件版本时，技能元数据仍指向旧插件版本，需要判断是否接受。
3. 归档 change，提交归档、文档、脚本与合并后的 specs，推送 `origin/main`。
4. 重启 DSH，确认没有 `skipping profile bundle`，并完成手工冒烟。

回滚顺序：

1. 恢复 `package.json`、`package-lock.json`、`skills/*/SKILL.md`、README、AGENTS、`cordis.patch.yml` 与本文档。
2. `npm install` 恢复旧 CLI 安装树。
3. 重跑测试矩阵与契约检查。
4. 若已发布，发布回滚版本并重启 DSH。

## 验收清单

- [ ] 目标版本的 release notes 与 CHANGELOG 已读，Breaking 与行为变化已记录。
- [ ] 目标版本的 `engines.node` 与 `version --json` 的 `schemaVersion` 已核对。
- [ ] 契约检查通过；失败项已判断是字段变化、fixture 问题还是清单过期。
- [ ] `package.json`、`package-lock.json`、版本断言、五份技能、README、AGENTS、`cordis.patch.yml` 已更新。
- [ ] Node 24 上 `npm test` 通过。
- [ ] Node 24 上 `npm run coverage:check` 通过。
- [ ] `openspec_inspect`（`action: "validate"`）传 `strict: true` 通过，`npm run openspec:check` 通过。
- [ ] DSH 会话冒烟通过，工具输出字段符合预期。
- [ ] 回滚步骤已演练或有明确记录。

## 来源

本地文件与行号（2026-11-12 工作树）：

- `package.json:55`、`package.json:3`：CLI pin 与插件版本。
- `lib/openspec.js:47`、`:106`、`:143`、`:153`、`:159`、`:351`、`:379`、`:393`、`:413`：CLI 解析、版本闸门、调用与错误处理。
- `lib/state.js:101`、`:133`、`:555`、`:607`、`:633`、`:657`、`:676`、`:697`、`:710`、`:729`、`:800`、`:814`、`:859`：CLI JSON 的投影读取点。
- `lib/tasks.js:20`、`:24`：任务行解析。
- `lib/schema.js:35`、`:115`、`:128`：schema 目录与闸门。
- `lib/tools/query.js`、`lib/tools/write.js`、`lib/init.js`：命令与选项。
- `skills/*/SKILL.md:7`、`test/openspec.test.mjs:11`、`test/skills.test.mjs:18`、`README.md:64`、`README.md:95`、`AGENTS.md:28`、`cordis.patch.yml:3`：版本字样与对照表。
- `scripts/cli-contract.json`、`scripts/check-cli-contract.mjs`、`test/cli-contract.test.mjs`：契约检查。

上游文档与 release：

- [Releases](https://github.com/Fission-AI/OpenSpec/releases)
- [CHANGELOG](https://github.com/Fission-AI/OpenSpec/blob/main/CHANGELOG.md)
- npm registry：`https://registry.npmjs.org/@fission-ai%2fopenspec`

相关调研：

- 工作区根目录 `openspec-cli-schema-compatibility.md`（2026-11-05）：CLI 版本与项目 schema 没有版本协商，旧 CLI 会忽略新 schema 的未知字段。
