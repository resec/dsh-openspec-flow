# Tasks

## 1. 修正激活参数形状

- [x] 1.1 修改 `lib/tools/review.js` 的 `startReviewerActivation`：把 `parent`、`cwd`、`prompt`、`agentPreset`、`agentOptions`、`signal` 移到 `startActivation` 参数顶层，删除 `request` 子对象。验证：`grep -n "request: {" lib/tools/review.js` 不再命中激活调用。
- [x] 1.2 更新 `test/review.test.mjs` 的三处断言（`activations[0].request.agentPreset`、`request.agentOptions`）为顶层字段，并新增 `activations[0].parent.id === 'review-test'` 与 `activations[0].request === undefined` 的回归断言。验证：`node --test test/review.test.mjs` 通过；把参数改回 `request` 嵌套时该用例失败。

## 2. 集成验证

- [x] 2.1 运行 `openspec_inspect` 的 `action: "validate"`（`strict: true`）、`npm test` 与 `npm run coverage:check`，确认通过且无新增告警。

## Workflow follow-up

- 提交修复后运行 apply review，修复全部 blocker。
- 归档仅在用户明确要求时执行。
- 归档后提交归档产物与文档，并推送到 `origin/main`。
