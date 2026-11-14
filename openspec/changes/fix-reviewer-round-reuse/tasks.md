# Tasks

## 1. 新轮次唤醒同一 reviewer

- [x] 1.1 在 `lib/tools/review.js` 的 `startReview` 中：新轮次且已有 slot 时，用 `subagents.sendMessage` 给 `slot.agentId` 发唤醒消息，更新 slot 的 `round`、`lastWokenAt`、`state: pending`，保持 `agentId` 不变，不追加 `replacements`；resume 未提交轮次不发消息；无 slot 时仍激活一个 reviewer。验证：新增测试断言 draft round 2 的 `messages` 增加、`activations` 不变、slot agentId 不变。
- [x] 1.2 在 `startApplyReview` 中应用同一逻辑。验证：新增测试断言 apply round 2 的 `messages` 增加、`activations` 不变。
- [x] 1.3 删除上一 change 在 start 路径中加入的新轮次 `startReviewerActivation` 与 `replacements` 追加逻辑；保留 `replace` 动作不变。验证：`grep -n "replacements.push" lib/tools/review.js` 只出现在 `replaceReview`，`replace` 测试仍通过。

## 2. 回归测试与文档

- [x] 2.1 改写 `test/review.test.mjs` 的两个新轮次用例：round 2 发消息给同一 agent、slot 不变；同一 agent 能提交 round 2；再次 `start` 同一未提交轮次不重复发消息。验证：`node --test test/review.test.mjs` 通过。
- [x] 2.2 更新 `docs/review.md`：每个新轮次唤醒同一 reviewer，只有 `replace` 启动新 reviewer；同步更新文档断言。验证：`node --test test/review-doc.test.mjs` 通过，且文档不再写「每个新轮次启动新 reviewer」。

## 3. 集成验证

- [x] 3.1 运行 `openspec_inspect` 的 `action: "validate"`（`strict: true`）确认 change 与全部主规格通过。验证：结果无 finding。
- [x] 3.2 在 Node 24 运行 `npm test` 与 `npm run coverage:check`。验证：命令退出码为 0，覆盖率门槛通过。
- [x] 3.3 运行 `npm run contract:check -- --candidate-bin node_modules/.bin/openspec` 与 `npm run openspec:check`。验证：命令退出码为 0。

## Workflow follow-up

- 提交实现后运行 apply 自评审并修复 blocker。
- 归档仅在用户明确要求时执行。
- 归档后提交归档产物、文档与合并后的规格，并推送到 `origin/main`。
