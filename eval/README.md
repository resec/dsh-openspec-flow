# 真实模型 e2e 评测

这套 harness 用真实模型跑两条路径，比较 token 消耗、流程摩擦与正确性：

- **official**：官方 OpenSpec 技能 + `openspec` CLI。
- **plugin**：本插件工具 + `openspec_init` 迁移后的技能 + 作用域策略。

两条路径使用同一夹具、同一提示词、同一模型与权限，只改变技能与工具面。全流程由脚本驱动：初始需求 → 创建变更确认 → 开始实施确认 → 归档请求。

## 前置条件

- 在插件仓库执行过 `npm install`（固定 `@fission-ai/openspec` 1.16.0）。
- 本机 `~/.dsh/.credentials.yaml` 存在，或通过 `--source-home` 指定包含该文件的目录。harness 会把它复制到私有 home，并以 `0600` 权限保存。
- 不需要手工创建 `headless` profile：harness 在私有 home 里生成 profile、bundle 列表和模型配置。
- 从本仓库根目录运行；私有 home、`eval/runs` 和缓存的写入都发生在工作区内。
- 真实调用会计费。默认模型 `deepseek-account/deepseek-flash`，`reasoningEffort=high`。
- 真实夹具的准备与单测依赖本仓库的基线提交，以及 POSIX 的 `git` 与 `tar`。

## 命令

```sh
# 只打印计划，不调用模型
npm run eval:dry

# 每个夹具、每个臂跑 1 次（pilot，仍会计费）
npm run eval:pilot

# 指定夹具与重复次数
node eval/run.mjs --execute --fixture budget-cli --arms official,plugin --runs 5

# 两个 worker 并发（默认 1）
node eval/run.mjs --execute --concurrency 2

# 调整单次超时与 token 预算
node eval/run.mjs --execute --timeout-min 30 --budget 5000000

# 指定凭据来源，或保留私有 home 调试
node eval/run.mjs --execute --source-home /path/to/home --keep-home

# 清理崩溃后遗留的私有 home
npm run eval:clean
```

没有 `--execute` 时，脚本只打印矩阵，不会启动 `dsh`，也不会产生费用。

## 隔离 home

每个 worker 使用一对私有目录：

- `eval/.dsh-home/`（并发时 `.dsh-home-worker-0..N-1`）：`DSH_HOME`，包含生成的 `headless` profile、凭据副本、sessions 和 logs。
- `eval/.agents-home/`（并发时 `.agents-home-worker-0..N-1`）：`DSH_AGENTS_HOME`，初始为空，避免用户级 skills 与 `AGENTS.md` 进入会话。

每个目录都带所有权标记，矩阵结束后自动删除；报告和 `eval/runs/` 下的运行产物保留。`--keep-home` 可保留一次用于调试，`npm run eval:clean` 扫描并清理崩溃后遗留的标记目录。默认不写入 `~/.dsh`，只从那里读取凭据。

## 并发

`--concurrency <n>` 设置 worker 数，默认 1。每个 worker 有自己的 home、profile 和凭据副本，因此不会争用同一个 `cordis.yml`。worker 从同一个 ABBA 顺序的单元格队列取任务，每个 worker 一次只跑一格。

- 并发只降低墙钟时间，不降低 token 消耗。
- 建议先从 2 开始，观察 `llm/retry`、429/限流和无效格；再考虑 3–4。
- 报告为每格记录 worker、开始/结束时间和 `wallMs`。
- 并发时 home 名称带 `-worker-<i>` 后缀，`eval:clean` 会全部扫描。

## 测试

```sh
npm run test:eval   # 只跑 eval/test/ 下的 harness 测试
npm run test:all    # 插件运行时测试 + harness 测试
```

harness 测试不调用真实模型；日常插件开发只需 `npm test`。

## 夹具

| id | 类型 | 来源 | 说明 |
| --- | --- | --- | --- |
| `budget-cli` | 合成 | 本目录 `fixtures/budget-cli/` | 小型 Node CLI；需求是月度汇总；隐藏验收检查 API 与 CLI |
| `policy-rule` | 真实 | 基线 `14dada0`，参考 `3f30caf` | 作用域 OpenSpec 策略；基线无 `lib/policy.js` |
| `skill-command-maps` | 真实 | 基线 `4a3b507`，参考 `6fd4df3` | 移除六份打包技能中的命令映射；`skillSource: fixture` |

真实夹具用 `git archive <base>` 从本仓库历史取出基线，再初始化固定提交；目标变更与隐藏验收在运行前都不在夹具里。真实夹具的请求文本会说明隐藏验收依赖的 API 或文件位置。

## 输出

每次矩阵写到 `eval/runs/<timestamp>/`：

- `report.md`、`report.json`：逐次运行、聚合、比值与 95% 区间。
- `<runId>/fixture/`：该次运行的完整工作树。
- `<runId>/rounds/`：每轮的 NDJSON 与 stderr。
- `<runId>/session.v4.jsonl.zstd`：会话日志副本，token 与工具数据的来源。
- `<runId>/gates/`：仓库测试、隐藏验收、`openspec validate --strict` 的日志。
- `<runId>/diff.patch`、`<runId>/run.json`：变更与指标记录。

## 判定

一次运行只有同时满足以下条件才算有效：

1. 夹具测试套件通过。
2. 隐藏验收通过。
3. `openspec validate <change> --strict` 通过。
4. `tasks.md` 全部勾选。
5. 变更已归档。
6. 运行未超时、未超预算、未停滞，且工具面符合所在臂。

失败的运行保留在报告里并标记无效，不参与聚合中位数。确认轮次单独标记，不计入意外干预。

### Token 口径

- `total`：所有 provider usage，包含确认轮次。
- `confirmationAck`：确认轮次中，首个工具调用之前的步骤用量；若第一轮就调用工具，则为 0。
- `work`：`total - confirmationAck`，是两臂比较使用的主指标。
- `confirmationRounds`：确认轮次的整轮用量，描述性字段，包含该轮实际完成的工作。

不按整轮扣除确认轮次，因为确认轮次通常正是执行创建的变更、实施或归档的轮次。

## 安全与边界

- 子代理工具由 `patches/no-subagents.yml` 关闭；联网工具保留。
- 提示词禁止提问；已知确认门由 harness 发送固定消息。
- 默认单次 45 分钟、800 万 token 预算；超时或超预算会中止并保留产物。
- 不接入 CI；harness 测试在 `eval/test/`，用 `npm run test:eval` 运行，不调用真实模型。
- 真正跑矩阵前会先做 `--dump-config` 预检；工具面在首轮请求头里再次核对。
- 私有 home 中的凭据副本以 `0600` 保存，随 home 一起删除；不要把它加入版本控制或复制到别处。
- `DSH_AGENTS_HOME` 为空意味着用户级 skills 与 `AGENTS.md` 不参与评测；这是受控对比的有意选择。

## 已知缺口

- 还没有上游 OpenSpec 仓库的真实夹具；`fixtures` 注册表已支持后续加入。
- 还没有价格表，报告只报 token 分类。
- 解析器只累加 `assistant/message` 的 provider usage；如果未来重试把用量写进 `assistant/attempt`，需要补入。
- 合成夹具的隐藏验收是行为契约，不覆盖实现风格。
