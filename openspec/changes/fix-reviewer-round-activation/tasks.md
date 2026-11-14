# Tasks

## 1. 每轮激活 reviewer

- [x] 1.1 在 `lib/tools/review.js` 的 `startReview` 中标记新轮次（上一轮已有报告或全新记录），`reviewers: 1` 时在新轮次激活 reviewer，并把 slot 的 `agentId`、`round`、`startedAt` 指向新 child；resume 未提交轮次不重复激活。验证：新增测试断言 draft round 2 的 `startActivation` 被调用且 slot 指向 `reviewer-2`。
- [x] 1.2 在 `startApplyReview` 中应用同一逻辑。验证：新增测试断言 apply round 2 的 `startActivation` 被调用且 slot 指向 `reviewer-2`。
- [x] 1.3 激活新轮次时在 slot 的 `replacements` 追加 `{ from, to, reason: "new <kind> round <n>", at }`，并重置 `retries`。验证：测试读取记录并断言 replacement 的来源、目标和 reason。

## 2. 回归测试与文档

- [x] 2.1 在 `test/review.test.mjs` 增加 draft 用例：round 2 激活新 reviewer；再次 `start` 同一未提交轮次不增加激活；旧 agent 提交被拒绝。验证：`node --test test/review.test.mjs` 通过。
- [x] 2.2 在 `test/review.test.mjs` 增加 apply 用例：round 2 激活新 reviewer 并更新 slot。验证：`node --test test/review.test.mjs` 通过。
- [x] 2.3 更新 `docs/review.md` 的 reviewer 模式段落，说明每个新轮次激活新的 reviewer，resume 不重复激活。验证：文档测试通过，且段落包含该说明。

## 3. 集成验证

- [x] 3.1 运行 `openspec_inspect` 的 `action: "validate"`（`strict: true`）确认 change 与全部主规格通过。验证：结果无 finding。
- [x] 3.2 在 Node 24 运行 `npm test` 与 `npm run coverage:check`。验证：命令退出码为 0，覆盖率门槛通过。
- [x] 3.3 运行 `npm run contract:check -- --candidate-bin node_modules/.bin/openspec` 与 `npm run openspec:check`。验证：命令退出码为 0。

## Workflow follow-up

- 提交实现后运行 apply 自评审并修复 blocker。
- 归档仅在用户明确要求时执行。
- 归档后提交归档产物、文档与合并后的规格，并推送到 `origin/main`。
