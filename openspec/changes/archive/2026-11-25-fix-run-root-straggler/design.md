# Design: 删除 run root 前终止整棵测试进程树

## Context

两个入口共用同一套 run root 生命周期（见 [proposal.md](proposal.md)）：

- `scripts/affected-tests.mjs`：创建 root、以 `TMPDIR` 传给 `node --test`、在 `finally` 里删除；SIGINT/SIGTERM 处理只调用 `activeChild.kill(signal)`，并在直接子进程退出后删除 root。
- `scripts/run-tests.mjs`：同样的 root 生命周期，同样只对直接子进程转发信号，且用 `process.once` 注册。

runner 的进程树至少三层：入口 → `node --test` → 测试文件进程 → 被测代码（e2e 用 `spawnSync` 启动 OpenSpec CLI）。信号只覆盖第一层，后两层在入口退出后仍持有 `TMPDIR`，其中任意一次递归 `mkdir` 都会重建已删除的 root。

现有约束：纯 ESM、仅 Node 内置模块；测试只在 Node 24 上跑；CI 在 ubuntu-latest；PR 与 main 上的 CI 运行 `npm run verify`（含覆盖率门槛）。

## Goals / Non-Goals

Goals：

- 在 POSIX 上，正常结束与 `SIGINT`/`SIGTERM` 两条路径删除 root 之前，本次运行启动的整棵进程树都已停止。
- 退出状态保持不变：信号路径 `128 + signal`，正常路径沿用 runner 状态。
- 不改变 `DSH_TEST_KEEP_TMP=1`、listing、无法解析基准目录这三类既有行为。

Non-Goals：

- 不处理自行 `setsid` 或 `detached` 逃出进程组的后代。
- 不处理入口自身被 `SIGKILL` 或崩溃的情形：`SIGKILL` 无法被捕获，因此脱离的进程组可能继续运行。
- 不为测试用例提供「保留后代进程」的开关。
- 不改变无进程组平台（Windows）的既有信号覆盖范围。

## Decisions

### 决策 1：POSIX 进程组，而不是遍历进程表

runner 以 `detached: true` 启动，成为新进程组的组长；信号与收尾都用 `process.kill(-child.pid, signal)` 面向整组。组由内核维护，覆盖 `node --test` 的隔离子进程、`spawnSync` 启动的 CLI 以及更深层后代。

替代方案：

- 逐测试清理：把契约推给每个测试文件，入口仍然会在删除后留下可重建的路径。
- 轮询 root 直到稳定为空：掩盖缺陷，且没有上界时可能挂住。
- 解析 `ps`/`pkill -P` 递归进程树：需要外部命令，存在 TOCTOU，跨平台行为不一致。

### 决策 2：信号路径与正常路径都补 SIGKILL，并在删除前有界等待

信号路径：先向整组转发 `SIGINT`/`SIGTERM`，让 runner 有机会收尾；等直接子进程退出后，对整组补 `SIGKILL`，再删除 root。
正常路径：runner 已退出，直接对整组补 `SIGKILL`，再删除 root。

补 `SIGKILL` 的理由是让忽略 `SIGTERM` 的后代也无法存活。删除前用 `process.kill(-pgid, 0)` 轮询等待组消失，上界 250 ms、间隔 10 ms：干净运行第一次探测即 `ESRCH`，零等待；确有残留时才等待，上界保证不会无限等待未回收的僵尸进程。

重复信号：监听器用 `process.on` 而非 `process.once`，每次收到信号都重新向整组转发；若直接子进程已经退出，仍用保留的最后子进程引用对整组补 `SIGKILL`，再删除 root 并退出。信号路径的收尾同样走统一的 `finishRun`（见决策 7）。

替代方案：

- 只转发 `SIGTERM`：忽略信号的成员会存活。
- 无条件 `setTimeout(250)` 等待：每次运行都付出固定延迟。

### 决策 3：共享模块 `scripts/run-signal.mjs`

新增模块导出六个函数：`spawnRunChild`（POSIX 设置 `detached`）、`signalRunChild`（整组信号，`ESRCH` 视为已退出）、`stopRunChild`（`SIGKILL` 整组 + 有界等待）、`finishRun`（决策 7 的收尾组合），以及两个辅助导出 `usesProcessGroup`（平台是否提供进程组）与 `runChildSpawnOptions`（是否追加 `detached`）。三个进程组函数都接受 `platform` 参数并默认 `process.platform`，让跨平台分支可以在同一套件里验证。两个入口使用同一实现，避免两套信号逻辑再次漂移，单元测试集中在 `test/run-signal.test.mjs`。

### 决策 4：无进程组平台只处理直接子进程

`process.kill(-pid)` 是 POSIX 语义。Windows 上不设置 `detached`，`signalRunChild`/`stopRunChild` 只对直接子进程操作，且不尝试整组信号。该降级在 delta 中单列一条需求，避免归档后的主规格承诺代码不提供的能力；`platform` 参数与 `usesProcessGroup` 让降级分支在没有 Windows 主机的套件里也可测，Windows 上后代存活的风险记录在 Risks 中。

### 决策 5：保留注入接缝

`affected-tests.mjs` 的 `main(argv, {spawn, tmpDir})` 是单元测试接缝。整组停止只在入口自己 spawn runner 时启用（`spawner === undefined`），注入的假 spawner 不受影响。

### 决策 6：回归用例用标记文件触发后代写入

后代在 `RUN_ROOT_STRAGGLER_SIGNAL` 指定的标记文件出现后才做递归 `mkdir`，外层用例在入口退出之后才写入该标记。这样用例不依赖「run 持续多久」「后代何时被调度」，未修复时必定重现重建，修复后后代已被杀死、标记无人响应。

后代同时把 pid 写入 `RUN_ROOT_STRAGGLER_PID`，外层用例在 `t.after` 里按该 pid 杀掉未修复路径下仍存活的轮询进程；`RUN_ROOT_STRAGGLER_DEADLINE_MS`（默认 30 秒）给轮询一个上界，标记始终不出现时自行退出。`stopRunChild` 的单元测试同样在 `finally` 中清理自己启动的子进程。这样红态验证和失败断言都不会留下不受管理的后代。

标记设计只验证「组是否被停止」，观察不到「停止先于删除」的顺序：`finish → stop` 与 `stop → finish` 都在入口退出前杀掉轮询进程，标记在退出后才写入，两种情况都不会重现重建。该顺序由决策 7 的单元测试覆盖。

### 决策 7：收尾顺序抽成可注入的 `finishRun`

`finishRun(child, finish, stop = stopRunChild)` 先 `await stop(child)`，再调用 `finish()`；停止调用失败时仍在 `finally` 中执行 `finish()`，因此停止错误不会让 run root 留下，两个入口捕获该错误、照常报告，且不改变运行的退出状态。两个入口的正常结束与信号路径都用两参数形式调用它。第三个参数是顺序单测的注入点：测试传入记录调用的假 stop，断言顺序为 `stop,finish`，实现反序会直接失败。这样「停止先于删除」有可判别的测试，而不需要让生产代码为端到端观察留暂停点。

替代方案：在端到端用例里让删除与停止之间可暂停 → 需要测试专用钩子，把测试关注点混进生产代码。

## Risks / Trade-offs

- `detached: true` 使 runner 脱离入口的进程组：入口被 `SIGKILL` 或崩溃时，脱离的组不会收到信号，可能继续运行 → 无法处理 `SIGKILL`，接受并在 Non-Goals 记录；可捕获的重复信号由决策 2 覆盖。
- `SIGKILL` 会截断后代的进行中写入 → 运行已结束、root 即将删除，可接受。
- 有界等待在僵尸未回收时会用满 250 ms → 只影响有残留的运行，干净运行零等待。
- 后代在等待上界内完成进行中的递归 `mkdir` 仍可能重建路径 → 概率极低且发生在删除之前，接受为残余风险。
- 自行 `setsid` 的后代会逃出组 → 记录为残余风险；e2e 的 CLI 不会这样做。
- 正常结束也终止遗留后代，可能改变依赖「测试留下后台进程」的用例 → 全套测试与覆盖率门槛会暴露这种用例，提交前以 `npm run verify` 验证。
- Windows 上后代存活的风险与今天相同 → delta 单列降级需求，不承诺整组停止。
- 未修复时用例会留下等待标记的轮询后代 → 夹具带 deadline 上界，用例在 `t.after` 按 pid 文件清理，单元测试在 `finally` 清理。
- 过滤后的 plain 运行（`--test-name-pattern` 在前）仍需加载全部测试文件，用例约 2–3 秒 → 可接受，且远低于整轮套件耗时。

## Migration Plan

无数据或配置迁移。回滚方式：两个入口改回直接子进程信号并删除新模块即可，仓库无持久化状态。

## Open Questions

无。
