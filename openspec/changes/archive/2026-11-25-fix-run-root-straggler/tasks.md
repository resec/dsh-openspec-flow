# Tasks

## 1. 进程组辅助模块与收尾顺序

- [x] 1.1 新增 `scripts/run-signal.mjs`，导出 `spawnRunChild`、`signalRunChild`、`stopRunChild`、`finishRun`，以及平台辅助 `usesProcessGroup`、`runChildSpawnOptions`；POSIX 设置 `detached` 并以 `-pid` 面向整组，Windows 只处理直接子进程且不尝试整组信号，三个进程组函数接受默认 `process.platform` 的 `platform` 参数；`stopRunChild` 补发 `SIGKILL` 后以 10 ms 间隔、250 ms 上界等待组消失，未启动的子进程直接返回；`finishRun(child, finish, stop = stopRunChild)` 先等待 `stop(child)` 再在 `finally` 中调用 `finish`，停止失败也执行删除，`child` 为 undefined 时只调用 `finish`，第三个参数是顺序单测的注入点。验证：`node -e "import('./scripts/run-signal.mjs').then((m) => console.log(Object.keys(m).sort().join(',')))"` 输出 `finishRun,runChildSpawnOptions,signalRunChild,spawnRunChild,stopRunChild,usesProcessGroup`。
- [x] 1.2 新增 `test/run-signal.test.mjs`：组首进程、组内孙进程随组终止、忽略 `SIGTERM` 的成员被 `SIGKILL`、组已不存在时不抛错；另加 `finishRun` 用例：以第三个参数注入记录调用的假 stop，断言顺序为 `stop,finish`、`child` 为 undefined 时只调用 `finish`、stop 失败时仍调用 `finish`；`stopRunChild` 对未启动子进程不抛错；平台降级用例断言 win32 下 spawn 选项不带 `detached`、直接子进程收到信号且不经过整组信号。每条用例在 `finally` 中杀掉自己启动的子进程，断言失败也不留后代。验证：`node --test test/run-signal.test.mjs` 通过，运行后 `pgrep -f 'run-signal-probe'` 无输出。

## 2. scoped 入口与回归夹具

- [x] 2.1 `scripts/affected-tests.mjs` 的 `spawnChild` 改用 `spawnRunChild`，正常结束的 `finally` 改为 `await finishRun(lastChild, lifecycle.finish)`，并保留最后一次子进程引用。验证：`npm run test:affected -- scripts/affected-tests.mjs` 通过。
- [x] 2.2 同一文件的信号处理改为 `process.on` 向整组转发信号，直接子进程退出后 `await finishRun(lastChild, finish)` 再退出，退出码保持 `128 + signal`；直接子进程已退出时（重复信号）同样先停止整组。验证：`node --test test/run-root-lifecycle.test.mjs` 通过。
- [x] 2.3 新增夹具 `test/fixtures/run-root-straggler.test.mjs`：按 `RUN_ROOT_STRAGGLER_MODE`（`exit`/`stay`）与 `RUN_ROOT_STRAGGLER_IGNORE` 启动孙进程，并把孙进程 pid 写入 `RUN_ROOT_STRAGGLER_PID`；孙进程轮询 `RUN_ROOT_STRAGGLER_SIGNAL` 标记文件，出现后对 `TMPDIR` 做递归 `mkdir`，`RUN_ROOT_STRAGGLER_DEADLINE_MS`（默认 30000）到期则直接退出。验证：以 `RUN_ROOT_STRAGGLER_DEADLINE_MS=100` 且不带标记单独运行夹具，夹具退出 0、300 ms 后 pid 文件中的进程已不存在、未创建目录。
- [x] 2.4 在 `test/run-root-lifecycle.test.mjs` 增加 scoped 用例：正常结束、`SIGTERM`、忽略 `SIGTERM` 的后代、无法解析基准目录；每条在入口退出后写入标记文件，等待 300 ms 后断言 `probe` 为空（无基准目录用例断言该路径不存在）且退出码符合预期，并在 `t.after` 中按 pid 文件杀掉仍存活的孙进程。验证按用例分别回退：删掉 2.1 的 `finishRun` 调用、只调用 `lifecycle.finish()` 时正常结束用例失败；删掉 2.2 的停止调用、只向直接子进程转发信号时 `SIGTERM` 用例失败；把 `stopRunChild` 的 `SIGKILL` 退化为只转发 `SIGTERM` 时忽略 `SIGTERM` 用例失败；把 `finishRun` 改成仅在 root 已解析时停止时无法解析基准目录用例失败；停止先于删除的顺序由 1.2 的 `finishRun` 顺序单测覆盖（标记文件在入口退出后才写入，观察不到该顺序）。恢复后四条全部通过。

## 3. plain 入口与文档

- [x] 3.1 `scripts/run-tests.mjs` 的 `runScope` 改用 `spawnRunChild`，正常结束在 `finally` 中 `await finishRun(lastChild, finish)`；信号处理改用 `process.on`，runner 退出后同样走 `finishRun`，重复信号也尝试停止。验证：`npm run test:affected -- scripts/run-tests.mjs` 通过。
- [x] 3.2 在 `test/run-root-lifecycle.test.mjs` 增加 plain 正常结束用例：以 `plugin -- --test-name-pattern='run root straggler' test/fixtures/run-root-straggler.test.mjs` 启动 plain 入口（`--test-name-pattern` 必须排在第一个文件路径之前，否则 Node 忽略过滤），等待正常退出后写入标记文件，断言 `probe` 为空且退出码 0，并在 `t.after` 中按 pid 文件杀掉仍存活的孙进程。验证：该用例在移除 3.1 的 `finishRun` 调用时失败，恢复后通过；过滤后的 plain 运行约 2–3 秒。
- [x] 3.3 更新 `README.md` 的 run root 段落：删除前终止本次运行启动的进程组；`DSH_TEST_KEEP_TMP=1` 只保留根、不保留后代。验证：`grep -q '进程组' README.md` 命中，且段落描述与实现一致。

## 4. 集成验证

- [x] 4.1 `openspec_inspect` 组合 `action: "validate"` 与 `strict: true` 通过，无长度或场景告警。验证：命令输出 `valid: true` 或等价无 finding 结果。
- [x] 4.2 在 Node 24 上运行 `npm run verify`，测试与覆盖率门槛同时通过。验证：命令退出码 0，并记录测试总数与覆盖率结论。
- [x] 4.3 连续运行 20 次 `node --test --test-name-pattern='SIGTERM' test/run-root-lifecycle.test.mjs`，无失败且 `TMPDIR` 无残留 root。验证：循环输出 `fails=0/20`。

## Workflow follow-up

- 提交实现并运行 apply 评审，修复全部 blocker 至 ready。
- 评审通过后 land 并归档，推送 `origin/main`。
- 推送后核对 `gh run list` 中该提交的 CI 结论。
