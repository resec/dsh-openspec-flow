# Proposal: 删除 run root 前终止整棵测试进程树

## Why

测试入口只对直接子进程转发 `SIGINT`/`SIGTERM`：`activeChild.kill(signal)` 之后删除 run root，而 runner 派生出的后代（例如 e2e 用例用 `spawnSync` 启动的 OpenSpec CLI）仍以 `TMPDIR` 指向该 root 继续运行；它们下一次递归 `mkdir` 会把已删除的路径整条重建。CI run 45530746131 的 `a scoped run interrupted by SIGTERM removes its root and exits 143` 因此失败：退出码 143 正确，目录断言却读到重建出来的 `openspec-flow-run-XDNHJA`。

本地以真实 e2e 路径复现了同一机制：入口删除成功后，孤儿 OpenSpec CLI（`ppid: 1`）仍在被删路径下执行递归 `mkdir`；40 轮带负载运行中 17 轮出现重建，全部轮次删除本身成功且无清理报错。因此问题不在删除失败，而在删除之后仍可能有后代写入。

正常结束时同样成立：入口在 runner 退出后删除 root，任何遗留后代都能在删除之后重建它。删除动作本身从不失败，失败的是「删除之后不再出现」这一契约。

## What Changes

- 测试入口在删除 run root 之前终止它为本次运行启动的进程组：POSIX 上以进程组方式启动 runner，信号转发给整组，runner 退出后对组补发 `SIGKILL` 并等待组消失，再删除 root。
- 正常结束路径与 `SIGINT`/`SIGTERM` 路径共用同一收尾逻辑；信号路径保持 `128 + signal` 退出码，并对重复信号继续尝试停止整组。
- 新增 `scripts/run-signal.mjs` 承载进程组启动、信号转发与停止等待；`scripts/affected-tests.mjs` 与 `scripts/run-tests.mjs` 改用同一实现。
- 新增回归夹具与用例：正常结束、`SIGTERM`、忽略 `SIGTERM` 的后代、无法解析基准目录四条路径都要求后代无法重建已删除的 root。
- README 的 run root 段落补充「删除前终止进程组」以及 `DSH_TEST_KEEP_TMP=1` 只保留根、不保留后代。
- 无进程组能力的平台（例如 Windows）只对直接子进程发信号，作为显式声明的降级。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `development-workflow`：新增需求 `A run stops its descendants before removing the root` 与 `A platform without process groups signals the direct child only`；既有需求 `A run removes its temporary root` 的文本与场景保持不变。

## Impact

- 新增 `scripts/run-signal.mjs`。
- 修改 `scripts/affected-tests.mjs`、`scripts/run-tests.mjs`、`README.md`。
- 新增 `test/run-signal.test.mjs`、`test/fixtures/run-root-straggler.test.mjs`；修改 `test/run-root-lifecycle.test.mjs`。
- 不涉及插件运行时、DSH 依赖、OpenSpec CLI 版本、打包产物或 CI 工作流。
