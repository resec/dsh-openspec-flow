# 升级 DSH 兼容版本

本文档面向维护者，说明把 `dsh-openspec-flow` 的 `engines.dsh` 从一个精确 DSH 版本移到另一个版本时，需要核对什么、改哪些文件、如何验证候选运行时，以及如何发布和回滚。OpenSpec CLI 的升级是另一条流程，见 [升级 OpenSpec CLI](upgrading-openspec-cli.md)。

当前基线（2026-11-12 工作树）：

- DSH：`=0.2.2-rc.2`（`package.json:10`）
- Node：`>=24.9.0`（`package.json:9`）
- 测试主版本：24（`coverage.config.json:2`）
- OpenSpec CLI：`@fission-ai/openspec` 2.0.0（`package.json` 的 `dependencies`）

DSH 在加载 profile 时逐个读取 bundle 的 `package.json`，用运行中的 DSH 版本检查 `engines.dsh`。不匹配时，安装可能被拒绝，已安装的 bundle 会在启动时被跳过；工具、技能与流程规则都不会注册。兼容声明是启动闸门，不是文档约定，因此升级必须同时移动声明、Node 基线与验证证据。

本文只描述流程与当前基线，不记录某次升级的版本差异、测量或结果；那类证据留在 change 产物与提交历史。

## 适用范围

适用于：

- 把 `engines.dsh` 从一个精确版本移到另一个精确版本。
- 上游发布新的 patch、minor、major 或预发布版本，需要判断是否跟进。
- 上游 release notes 列出插件迁移项，需要判断是否影响本插件。
- 目标版本的 `engines.node` 与当前 Node 基线不同，需要同步调整。

不适用于：

- OpenSpec CLI 的升级。见 [升级 OpenSpec CLI](upgrading-openspec-cli.md)。
- 只升级 DSH 桌面端界面，不改变运行中的 `dsh` 版本。此时 `engines.dsh` 不需要移动。
- 通过 `compatibility.json` 长期豁免版本不匹配。豁免只用于本地诊断。

## 兼容性判定

### 判定来源

判定在 `@deepseek-ai/dsh-app-boot` 中实现，入口符号是 `evaluatePluginCompatibility`。`loadProfileDirectory` 对 `dsh.profile.bundles` 的每一项调用它，`pluginCompatibilityWarning` 生成诊断文本。以 DSH 安装根目录为基准，对应文件是 `node_modules/@deepseek-ai/dsh-app-boot/lib/index.js`。

规则：

- 插件 manifest 有 `engines.dsh` 时，只用它决定；`peerDependencies` 中的 `@deepseek-ai/dsh` 与 `@deepseek-ai/dsh-*` 不再参与。
- 没有 `engines.dsh` 时，逐个检查 `peerDependencies` 中的 DSH 包。
- 比较使用 `semver.satisfies(runtimeVersion, range, { includePrerelease: true })`。`runtimeVersion` 取自 `dsh-app-boot` 自己的 `package.json` 版本；正常安装中它与 `dsh --version` 一致。
- 预发布版本参与匹配。`=0.2.2-rc.2` 只接受该版本；`^0.2.2` 在 `includePrerelease` 下会接受后续预发布版本，例如 `0.2.3-rc.1`。manifest 必须写 `=<version>`，不能用 `^`、`~` 或 `>=`。

### 不匹配的后果

- 安装：`dsh plugin add` 与插件管理器在预检阶段读取待装包的 manifest 并判定。不匹配时输出 `dsh: installation rejected: ...`，只初始化 profile，不安装该包，并打印 `dsh plugin --profile <name> allow-version ...` 的风险提示。
- 启动：已安装但未豁免的不匹配 bundle 被跳过，stderr 输出 `dsh: skipping profile bundle "dsh-openspec-flow": ...`，随后是 `Plugin ... incompatible ...` 的拒绝原因。该 bundle 的 patch 不参与组合，工具、技能与策略都不注册。
- 豁免：profile 目录的 `compatibility.json` 以 `<package>@<version>` 为键、精确 DSH 版本数组为值。`dsh plugin --profile <name> version-exemptions` 列出，`allow-version` 授予，`revoke-version` 撤销。授予要求 `--accept-risk`，且只对精确的包版本与运行时版本生效。
- 豁免是本地诊断手段，不作为兼容性证据，也不写入仓库。

### 隔离验证的前置

`dsh --dump-config` 与 profile 启动都会重写 `$DSH_HOME/profiles/<name>/cordis.yml`。候选运行时验证必须使用独立的 `DSH_HOME`，不要指向正在使用的 Harness 主目录。

## 升级决策

### 读取目标版本事实

先读 release notes，再决定是否跟进。DSH 的 release 页与 tag 命名：

- Release：`https://github.com/deepseek-ai/deepseek-harness/releases`
- Tag：`dsh-v<version>`；compare 链接为 `https://github.com/deepseek-ai/deepseek-harness/compare/dsh-v<old>...dsh-v<new>`

重点读中文「其他变更」与英文 `Chores` 段。这些段落列出需要插件或 SDK 迁移的改动，常涉及「插件」「自定义插件」「Cordis」「bundle」「tools.」「systemPrompt」「session」。把与本文「DSH 耦合面」冲突的条目逐条记录，作为候选版本的风险清单。

确认目标版本已发布到 npm：

```bash
npm view @deepseek-ai/dsh@<version> version
```

GitHub release 与 npm 发布不保证同步；registry 没有该版本时，不能安装候选运行时，也不能验证。若本机 npm 缓存不可写（曾出现 `EACCES`），改用临时缓存：

```bash
npm_config_cache="$(mktemp -d)" npm view @deepseek-ai/dsh@<version> version
```

记录目标版本的 Node 下限：

```bash
npm view @deepseek-ai/dsh@<version> engines.node --json
```

`npm view` 返回单元素数组，例如 `[">=24.9.0"]`。下限提高时，插件的 `engines.node` 必须同步，测试入口也只接受满足新下限的版本。

同时记录 Node 主版本。当前主版本 24 记录在 `coverage.config.json:2` 与 `openspec/specs/project-invariants/spec.md` 的 `Runtime baseline`。目标版本把主版本移走时，`engines.node`、`coverage.config.json`、覆盖基线、规格与测试入口的提示文本要一起改；只改 `engines.node` 不够。

同时记录目标版本声明的 pnpm 版本。读取目标 tag 根 `package.json` 的 `packageManager`：

```bash
gh api "repos/deepseek-ai/deepseek-harness/contents/package.json?ref=dsh-v<version>" \
  --jq '.content' | base64 -d | grep packageManager
```

已发布的 `@deepseek-ai/dsh` 包不携带该字段，源码 tag 是唯一来源；不要改为在 bootstrap 运行时联网读取。当前 pin 记在 `scripts/toolchain.mjs` 的 `PNPM_VERSION`。

### 判断升级类型

| 上游变化 | 对插件的影响 | 需要做的事 |
| --- | --- | --- |
| 仅应用层界面、模型或工具实现变化 | 无 | 移动 `engines.dsh`，按本文验证 |
| `engines.node` 下界提高或主版本变化 | 测试入口与覆盖率基线可能不满足 | 同步 `engines.node`、`coverage.config.json`、基线文件与规格 |
| `inject` 的服务改名或删除 | 插件不完成挂载，工具与技能缺失 | 改 `index.js` 的 `inject` 与对应 `lib/*` 调用 |
| `ToolDefinition`、`output` 或 `execute` 契约变化 | 工具注册失败、输出校验失败或取消语义变化 | 改 `lib/tools/*` 与 `test/fake-context.mjs` |
| `subprocess` 的 spawn 规格或句柄变化 | 所有 CLI 调用失败或读不到输出 | 改 `lib/openspec.js` |
| `systemPrompt` 的 section 或排序接口变化 | 流程规则不挂载或顺序错误 | 改 `lib/policy.js` |
| `agents`、`commands`、`skills` 注册接口变化 | 策略、`/opsx-admin` 或技能目录缺失 | 改 `lib/policy.js`、`lib/admin.js`、`lib/skill.js` |
| bundle patch 方言或 loader 变化 | 插件行不参与组合 | 改 `cordis.patch.yml`，用 `--dump-config` 验证 |
| 错误类型、取消或超时语义变化 | CLI 失败信息与中断路径变化 | 核对 `lib/openspec.js` 的错误处理与测试 |
| Cordis 版本、timer 或 fiber 变化 | 生命周期、dispose 与热重载行为变化 | 核对 `ctx.effect`、事件注册与重载测试 |

## DSH 耦合面

行号基于 2026-11-12 工作树；升级后先用 `grep` 重新定位。

| 位置 | 依赖的内容 | 升级检查 |
| --- | --- | --- |
| `package.json:8-10` | `engines.node` 与精确的 `engines.dsh` | 目标下限与精确版本 |
| `package.json` 的 `dependencies` | 仅 `@fission-ai/openspec` 2.0.0；插件不依赖 `@deepseek-ai/*` | 运行时只允许 Node built-ins 与相对模块 |
| `package.json:18-21` | `dsh.bundle.patch` 指向 `cordis.patch.yml` | 目标 loader 仍接受该声明 |
| `cordis.patch.yml:6-9` | 一行 `insert`，`id: openspec-flow`，`name: dsh-openspec-flow` | `--dump-config` 中仍有该行 |
| `index.js:29` | Cordis 插件名 `openspec-flow` | 与 profile 行、日志前缀一致 |
| `index.js:32` | `inject` 的五个服务：`tools`、`subprocess`、`workingDirectory`、`systemPrompt`、`agents` | 五个服务名仍存在；缺一个时插件不会挂载 |
| `index.js:45-84` | Standard Schema 形式的 `Config` | loader 仍按 Standard Schema 校验 |
| `lib/review/settings.js`、`lib/client/channel.js` | `/openspec-review` 通道与 `reviewCards/get` 端点；卡片文件读取、turn 绑定与投递水位 | 端点名与客户端一致；卡片文件布局 `<sessionKey>-<kind>-<phase>-<round>.json`，旧的无 kind 名仍可读；隔离 DSH 自动检查 |
| `client.js` 的 `ReviewCardTail` | `conversation.chat.turnTail` owner props 的 `turn: TurnLocation`；`TurnLocation.start`/`end` 是 `SessionEvent`，`SessionEvent.time` 为 Unix epoch 毫秒 | 字段名或单位变化时改客户端；`grep -n 'chat.turnTail' docs/upgrading-dsh-runtime.md` |
| `index.js:86` | `apply(ctx, config)` | Cordis 插件入口约定 |
| `lib/tools/apply.js:35,117`、`lib/tools/query.js:630,694,913`、`lib/tools/write.js:27,125`、`lib/init.js:26` | `ctx.effect` 包裹的 `ctx.tools.register` | `ToolDefinition` 的 `name`、`description`、`parameters`、`output.schema`、`output.render`、`execute` 字段 |
| `reviewer.js` | `ctx.tools.definitions()` 的全局视图、`ctx.tools.restrict({ deny })`、`tools/change` 事件 | `ToolRestriction` 的 deny 语义、scope 父链、禁用名集合；reviewer 目录是 preset 的七个工具，`read_image` 只在 Host 提供 `attachments` 时注册 |
| `cordis.patch.yml:22-28` | preset 的 `tool-fs` 子行开启 `readImage`；`read_image` 依赖 Host `attachments` 服务与声明图片输入的模型路由 | `readImage` 键、`ctx.attachments` 服务名、模型图片模态；缺 `attachments` 时工具不注册 |
| `lib/tools/shared.js:108,110` | `workingDirectory.ensure`、`defaultDirectory` | 方法名与返回类型 |
| `lib/worktree/create.js` | `workingDirectory.set(agent, path, signal)` | 方法名、三参数签名与返回类型 |
| `lib/tools/shared.js:221` | `output.render` 返回 `[{ type: 'text', text }]` | `ContentBlock` 结构 |
| `lib/openspec.js:252-282` | `subprocess.spawn` 的 `argv`、`cwd`、`stdio`、`graceMs`、`signal`、`env`；`handle.done`；`collected.stdout.readFrom` | spawn 规格与收集输出接口 |
| `lib/policy.js:85-102` | `agent.ctx.systemPrompt`、`systemPrompt.section` 与 `getSectionOrder('PLAN_POLICY')` | agent 上下文与服务方法签名 |
| `lib/policy.js:135,138` | `agent/created` 事件与 `agents.list()` | 事件名、载荷与服务 |
| `lib/admin.js:146,163` | `ctx.get('commands')` 与 `commands.register` | 可选服务仍存在；命令定义字段 |
| `lib/admin.js:154` | `agent/status` 事件 | 事件名与载荷 |
| `lib/skill.js:177` | `skills.registerProvider(factory)` | provider 工厂、candidate 字段与 `SkillProviderControl` |
| `test/fake-context.mjs` | 上述服务的测试替身，包括 `tools.definitions`、`tools.restrict` 与 `tools/change` | 真实契约变化时同步更新替身；restriction 与全局工具快照用 fake 的 `restrictions`/`globalTools` 断言 |

DSH 侧对应的声明文件与符号：

| DSH 包 | 声明 | 插件读取的成员 |
| --- | --- | --- |
| `dsh-app-boot` | `lib/index.js` | `evaluatePluginCompatibility`、`loadProfileDirectory`、`pluginCompatibilityWarning`、`readProfileVersionExemptions` |
| `dsh-tools` | `lib/types/contracts.d.ts` | `ToolDefinition`、`ToolOutputDefinition` |
| `dsh-tools` | `lib/types/index.d.ts` | `ToolsService.definitions`、`ToolsService.restrict`、`ToolRestriction`、`tools/change` 事件 |
| `dsh-scope` | `lib/types/index.d.ts` | scope 父链绑定（`scopeOf`、`bindScopeParent` 的语义）；restriction 在 agent 视图上的交集行为 |
| `dsh-subprocess` | `lib/types/types.d.ts` | `SubprocessSpawnSpec`、`SubprocessHandle`、`SubprocessCollectedOutputs` |
| `dsh-working-directory` | `lib/types/index.d.ts` | `get`、`ensure`、`set`、`defaultDirectory` |
| `dsh-system-prompt` | `lib/types/index.d.ts` | `section`、`getSectionOrder`、`PromptSectionOrderName` |
| `dsh-agent` | `lib/types/index.d.ts` | `list()` |
| `dsh-skill` | `lib/types/index.d.ts` | `registerProvider`、`SkillProvider` |
| `dsh-commands` | `lib/types/index.d.ts` | `register`、`CommandDefinition` |
| `dsh-client-ui-chat` | `src/client/contract/slots.ts` | `conversation.chat.turnTail` 的 `TurnTailOwnerProps`（`turn: TurnLocation`） |
| `dsh-client-ui-conversation` | `lib/types/client/contract/conversation.d.ts` | `TurnLocation.start`/`end`（`SessionEvent`） |
| `dsh-session` | `lib/types/types.d.ts` | `SessionEvent.time`（Unix epoch 毫秒） |
| `cordis-plugin-loader` | Loader YAML 方言 | `cordis.patch.yml` 的 `insert` |

路径相对 DSH 安装根目录下的 `node_modules/@deepseek-ai/<package>/`。

## 修改顺序

### 记录目标版本事实

1. 记录 release notes、compare 链接、npm 发布状态、`engines.node` 与 Node 主版本；把插件迁移条目列成风险清单。
2. 定位当前安装并核对运行版本：

   ```bash
   command -v dsh
   dsh --version
   npm root -g
   ```

   `dsh --version` 应与 `package.json` 的 `engines.dsh` 一致。不一致时先解释差异（桌面端随附运行时、全局安装或 profile 使用的二进制可能不同），再继续；当前不匹配意味着插件此刻已被跳过。

### 建立候选运行时

3. 安装候选运行时到独立前缀：

   ```bash
   export PATH="<Node 24 的 bin 目录>:$PATH"
   node --version
   CANDIDATE="$(mktemp -d)"
   npm_config_cache="$CANDIDATE/npm-cache" npm install --prefix "$CANDIDATE/dsh" "@deepseek-ai/dsh@<target>"
   "$CANDIDATE/dsh/node_modules/.bin/dsh" --version
   ```

   Node 必须满足目标版本的 `engines.node`。测试入口只检查 PATH 上的 `node`，不会调用 fnm、nvm 或 volta。目标版本已经安装时，可把该安装根目录当作 `CANDIDATE`，不必重复下载。

4. 对比服务声明：

   ```bash
   OLD_DSH="$(npm root -g)/@deepseek-ai/dsh"
   for pkg in dsh-tools dsh-subprocess dsh-working-directory dsh-system-prompt dsh-agent dsh-skill dsh-commands; do
     diff -ru "$OLD_DSH/node_modules/@deepseek-ai/$pkg/lib/types" \
             "$CANDIDATE/dsh/node_modules/@deepseek-ai/$pkg/lib/types"
   done
   ```

   `OLD_DSH` 按全局 npm 安装取值；其他安装方式用实际的 DSH 安装根目录替换。

   新增成员通常安全；删除、改名、参数或返回类型变化要按「DSH 耦合面」改代码。声明文件只覆盖类型，不覆盖运行时行为，不能替代实际启动。

5. 核对判定实现仍与本文一致：

   ```bash
   grep -n "function evaluatePluginCompatibility" "$CANDIDATE/dsh/node_modules/@deepseek-ai/dsh-app-boot/lib/index.js"
   ```

   若 `engines.dsh` 的优先级、`includePrerelease` 选项或豁免读取方式改变，先更新本文「兼容性判定」再继续。

### 修改 manifest 与 Node 基线

6. 把 `package.json:10` 的 `engines.dsh` 改为 `=<target>`，保留 `=`。
7. 目标下限与当前不同时，把 `package.json:9` 的 `engines.node` 改为目标下限。
8. Node 主版本变化时，依次处理：
   - 改 `coverage.config.json:2` 的 `primaryNodeMajor`。
   - 用满足新下限的 Node 重跑 `npm run coverage:baseline`，更新 `coverage.baseline.json` 的 `node.version` 与 `node.range`。
   - 在 change 的 delta spec 中更新 `project-invariants` 的 `Runtime baseline`；不要直接改主 spec，归档时由 `openspec_archive` 合并。
   - 核对 `scripts/node-version.mjs`、`scripts/run-tests.mjs`、`scripts/coverage.mjs`、`scripts/coverage-gate.mjs` 的提示文本与 Node 24 假设。
   - 更新 `AGENTS.md:25` 与 `README.md` 的「测试运行时」段落。
9. 不要用 `^`、`~` 或 `>=` 代替精确 pin，也不要先加 `compatibility.json` 豁免再升级。

**pnpm pin**：把 `scripts/toolchain.mjs` 的 `PNPM_VERSION` 改为目标 tag 声明的版本，并同步 `.github/workflows/ci.yml`、`docs/lab.md` 与 `CONTRIBUTING.md`；`test/ci-workflow.test.mjs` 会校验三处一致。不要把这个版本写进本仓库 `package.json` 的 `packageManager`，也不要改为 devDependency。

### 隔离组合检查

10. 用候选运行时初始化独立 profile，并装入当前工作树的插件：

    ```bash
    export DSH_HOME="$(mktemp -d)"
    "$CANDIDATE/dsh/node_modules/.bin/dsh" plugin --profile compat add "link:$PWD"
    ```

    该命令需要 PATH 上有 pnpm。`link:` 指向插件目录，profile 的 `node_modules` 不复制插件依赖；本仓库需先执行过 `npm install`，否则运行时会找不到 `@fission-ai/openspec`。安装完成后，声明了 `dsh.bundle` 的包会被追加到 profile 的 `dsh.profile.bundles`。

11. 组合并检查：

    ```bash
    "$CANDIDATE/dsh/node_modules/.bin/dsh" --profile compat --dump-config > "$DSH_HOME/compat.yml" 2> "$DSH_HOME/compat.err"
    grep -n "openspec-flow" "$DSH_HOME/compat.yml"
    ! grep -q "skipping profile bundle" "$DSH_HOME/compat.err"
    ```

    通过标准：组合输出里有一行 `id: openspec-flow`，stderr 没有 `skipping profile bundle`。安装预检会用候选运行时判定 `engines.dsh`；不匹配时第 10 步已经以 `installation rejected` 失败。

    `--dump-config` 只证明 manifest 闸门与 patch 组合，不挂载插件，不能证明服务契约。

### 实际启动

12. 把目标运行时安装到运行 profile 的位置。全局 npm 安装的示例：

    ```bash
    npm install -g "@deepseek-ai/dsh@<target>"
    dsh --version
    ```

    桌面端使用随附运行时，需按其升级渠道替换；`npm install -g` 只影响通过全局 npm 安装的 `dsh`。不要在同一台机器上并行保留两个 `dsh` 入口。

13. 重启 profile，确认 stderr 没有 `skipping profile bundle`，然后在 OpenSpec 项目里按「测试矩阵」冒烟。

14. 冒烟失败时先判断是插件代码、目标运行时的契约变化，还是目标版本本身的问题。可修则修并补回归测试；不可修则按「发布与回滚」恢复旧版本，不要用豁免长期运行。

### 文档与规格

15. 更新 `README.md` 的「版本兼容性」段落：`dsh` 与 `node` 的版本、跳过 bundle 的说明，以及指向本文档的链接。
16. 更新本文档的基线与示例版本。
17. 更新 `docs/upgrading-openspec-cli.md:9` 的 DSH 基线，保持两份指南一致。
18. Node 主版本或下限变化时，在 change 的 delta spec 中更新 `project-invariants`，归档后由 `openspec_archive` 合并。
19. 若本次发布新插件版本，改 `package.json:3`，并同步五份 `skills/*/SKILL.md` 的 `metadata.generatedBy`；`test/skills.test.mjs` 会校验它与 `package.json` 一致。

## 测试矩阵

| 检查 | 命令 | 通过标准 |
| --- | --- | --- |
| Node 预检 | `node --version` | 主版本符合 `primaryNodeMajor`，具体版本满足 `engines.node` |
| 插件测试与覆盖率 | `npm run verify` | 退出 0，测试全部通过且不低于基线 |
| pnpm pin 一致性 | `node --test test/ci-workflow.test.mjs` | 退出 0 |
| OpenSpec 严格校验 | `npm run openspec:check` | 退出 0 |
| 候选组合 | 上文 `--dump-config` | 有 `openspec-flow` 行，无 `skipping profile bundle` |
| 实际启动 | 重启 profile | stderr 无 `skipping profile bundle` |
| 工具冒烟 | `openspec_inspect`（`list`、`status`、`validate`）、`openspec_apply_next`、`openspec_mark_task_done` | 结果字段完整，没有工具缺失 |
| 归档冒烟 | `openspec_archive`（在临时 change 上） | 归档目录与合并后的 specs 符合预期 |
| 技能目录 | 会话技能目录 | 五份 `openspec-*` 技能可见 |
| 策略段 | OpenSpec 项目与非 OpenSpec 项目各一个会话 | 前者出现 `openspec-flow:policy`，后者不出现 |
| 管理命令 | `/opsx-admin` | 三个管理工具在当次回合出现 |

`contract:check` 检查的是 OpenSpec CLI 的 JSON 契约，不覆盖 DSH 服务契约；DSH 升级不要把它当作验证依据。

负向检查至少覆盖：

- **版本不匹配**：用一个仍声明旧 `engines.dsh` 的插件副本或 profile，以目标运行时执行 `--dump-config`；应出现 `skipping profile bundle` 并缺少插件行。这是闸门生效的预期结果。
- **安装拒绝**：同样条件下执行 `dsh plugin add`，应以 `installation rejected` 失败，且不安装该包。
- **豁免**：`allow-version` 后组合应重新出现插件行；该结果只用于确认诊断路径，验证后执行 `revoke-version`，不能作为发布证据。

## 发布与回滚

发布：

1. 所有任务完成，严格校验、`npm run verify`、`npm run openspec:check` 通过。
2. 若发布新插件版本，升 `package.json:3` 并同步五份技能元数据。
3. 归档 change，单次提交归档、文档与合并后的 specs，推送 `origin/main`。
4. 在使用处安装目标运行时并重启，完成「实际启动」与冒烟。

回滚：

1. 恢复 `package.json`、`README.md`、本文档、`docs/upgrading-openspec-cli.md`、`AGENTS.md` 与覆盖基线。
2. 重新安装旧运行时：`npm install -g "@deepseek-ai/dsh@<old>"`，或使用原发行渠道。
3. 重启 profile，确认 stderr 没有 `skipping profile bundle`，重跑测试矩阵与候选组合检查。
4. 若已发布新插件版本，发布回滚版本并同步技能元数据。

## 验收清单

- [ ] 目标版本的 release notes、compare 链接与 npm 发布状态已记录。
- [ ] 目标 `engines.node` 与 Node 主版本已核对。
- [ ] 目标 tag 的 `packageManager` 已记录，`scripts/toolchain.mjs` 的 pin、CI 与文档一致。
- [ ] 服务声明 diff 已读，耦合面差异已判断。
- [ ] `engines.dsh` 是 `=<target>`，`engines.node` 与目标下限一致。
- [ ] Node 主版本变化时，`coverage.config.json`、覆盖基线、`project-invariants` 与测试入口提示同步。
- [ ] 隔离 profile 的 `--dump-config` 有插件行且无 `skipping profile bundle`。
- [ ] 目标运行时实际启动无跳过诊断，工具、技能、策略与管理命令冒烟通过。
- [ ] 满足新下限的 Node 上 `npm run verify`、`npm run openspec:check` 通过。
- [ ] `README.md`、本文档与 CLI 指南的基线已更新。
- [ ] 回滚步骤已演练或有明确记录。

## 来源

本地文件与行号（2026-11-11 工作树）：

- `package.json:3`、`:8-10`、`:18-21`：插件版本、引擎声明与 bundle 声明。
- `index.js:29`、`:32`、`:45-84`、`:86`：插件名、注入、配置与入口。
- `lib/tools/apply.js:35`、`:117`；`lib/tools/query.js:630`、`:694`、`:913`；`lib/tools/write.js:27`、`:125`；`lib/init.js:26`：工具注册。
- `lib/tools/shared.js:108`、`:110`、`:221`：工作目录与输出渲染。
- `lib/openspec.js:252-282`：子进程调用。
- `lib/policy.js:85-102`、`:135`、`:138`：策略段与 agent 事件。
- `lib/admin.js:146`、`:154`、`:163`：命令注册与状态事件。
- `lib/skill.js:177`：技能提供者注册。
- `lib/skills.js:20`、`:23`：插件版本与技能元数据。
- `scripts/node-version.mjs`、`scripts/run-tests.mjs`、`scripts/coverage.mjs`、`scripts/coverage-gate.mjs`：Node 门槛与覆盖率入口。
- `coverage.config.json:2`、`coverage.baseline.json`：主版本与基线。
- `test/fake-context.mjs:23`：Host 替身。
- `README.md`「版本兼容性」「测试运行时」「验证」；`AGENTS.md:24-25`；`docs/upgrading-openspec-cli.md:9`：版本字样与说明。

DSH 安装树（全局 npm 安装，相对 `$(npm root -g)/@deepseek-ai/dsh`）：

- `node_modules/@deepseek-ai/dsh-app-boot/lib/index.js`：`evaluatePluginCompatibility`、`loadProfileDirectory`、`pluginCompatibilityWarning`、`readProfileVersionExemptions`。
- `node_modules/@deepseek-ai/dsh-tools/lib/types/contracts.d.ts`：`ToolDefinition`、`ToolOutputDefinition`。
- `node_modules/@deepseek-ai/dsh-subprocess/lib/types/types.d.ts`：`SubprocessSpawnSpec`、`SubprocessHandle`、`SubprocessCollectedOutputs`。
- `node_modules/@deepseek-ai/dsh-working-directory/lib/types/index.d.ts`：`get`、`ensure`、`set`、`defaultDirectory`。
- `node_modules/@deepseek-ai/dsh-system-prompt/lib/types/index.d.ts`：`section`、`getSectionOrder`。
- `node_modules/@deepseek-ai/dsh-agent/lib/types/index.d.ts`：`list()`。
- `node_modules/@deepseek-ai/dsh-skill/lib/types/index.d.ts`：`registerProvider`。
- `node_modules/@deepseek-ai/dsh-commands/lib/types/index.d.ts`：`register`。
- `node_modules/@deepseek-ai/cordis-plugin-loader`：Loader YAML 方言。

上游文档：

- [DSH releases](https://github.com/deepseek-ai/deepseek-harness/releases)
- [npm registry](https://registry.npmjs.org/@deepseek-ai%2Fdsh)
- DSH 包的 `repository` 字段指向 `https://github.com/deepseek-ai/deepseek-harness`（`apps/cli`）。
