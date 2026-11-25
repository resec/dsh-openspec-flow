# Tasks

## 1. 工作流并发策略

- [x] 1.1 在 `test/ci-workflow.test.mjs` 增加断言：`concurrency` 块位于顶层（在第一个 `jobs:` 之前），块内组名为 `ci-${{ github.ref }}`，`cancel-in-progress` 为 `${{ github.event_name == 'pull_request' }}`；并验证该断言在未改工作流时失败
- [x] 1.2 把 `.github/workflows/ci.yml` 的 `cancel-in-progress` 改为 `${{ github.event_name == 'pull_request' }}`，并验证 `node --test test/ci-workflow.test.mjs` 由红转绿
- [x] 1.3 在 Node 24 下运行 `npm run test:affected -- test/ci-workflow.test.mjs`、`npm run openspec:check`、`npm run check:requirement-length` 与 `npm run verify`，验证四条命令全部通过

## Workflow follow-up

- Archive the change after the apply review is ready.
- Push `main` and confirm that two consecutive pushes, where the second arrives while the first run is in progress, both reach a terminal conclusion instead of `cancelled`; a third push inside the same window still replaces the single pending run.
