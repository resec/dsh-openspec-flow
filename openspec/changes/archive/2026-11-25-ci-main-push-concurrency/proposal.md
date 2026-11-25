# Proposal: main 推送不取消进行中的 CI 运行

## Why

main 的「落地 + 归档」两连推常落在同一并发组内，后一次运行启动时取消前一次运行，使先推送的提交只留下 `cancelled` 结论。两次实例：run 45546501313（`d69044d`）被 run 45546551872（`1e4331b`）顶掉；run 45550970165（`54f2740`）被 run 45551025403（`238732d`）顶掉。提交的检查结论因此不可作为该提交的验证依据。

## What Changes

- `.github/workflows/ci.yml` 的 `cancel-in-progress` 由常量 `true` 改为 `${{ github.event_name == 'pull_request' }}`；并发组保持 `ci-${{ github.ref }}`。
- main 上的推送改为排队：进行中的运行不被取消，新运行进入 pending，前一次结束后开始。
- 该配置受平台限制约束：默认 `queue: single` 每组只保留一个 pending 运行，因此在同一次运行窗口内到达的第三次推送会顶掉那次 pending，被顶掉的提交仍以 `cancelled` 结束。本变更不消除这一限制，只消除常见的两连推取消。
- 拉取请求的取消行为不变：同一 PR 的新推送仍取消旧运行。
- `test/ci-workflow.test.mjs` 增加断言：`concurrency` 块位于顶层（第一个 `jobs:` 之前），并锁定组名与条件取消表达式。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `contributor-workflow`：新增一条要求，规定 CI 只在 `pull_request` 事件取消进行中的运行，main 的推送排队等待。

## Impact

- 代码：`.github/workflows/ci.yml`、`test/ci-workflow.test.mjs`。
- 受限路径：`.github/workflows/` 属受限路径，本变更须由维护者以同仓提交或同仓 `resec` 的拉取请求落地；`scripts/check-pr-change.mjs` 会对任何外部拉取请求报 `.github/workflows/ci.yml`，维护者豁免不适用于外部贡献。
- 运行行为：main 上的推送串行执行。tip 提交变绿推迟到前一次运行结束；前一次运行挂起时推迟到它的 job 超时，`verify` 为 20 分钟、`lab` 为 30 分钟。峰值并发不升高。
- 未改变：两个 job 的步骤、PR 的取消语义、`lab` 与 `verify` 的门禁内容。
