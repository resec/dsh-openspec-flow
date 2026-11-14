# Tasks

## 1. 无 git 时锁定 apply review 关闭

- [x] 1.1 修改 `lib/review/policy.js` 的 `buildPolicy`：`gitEnabled` 为假时把 `reviews.apply.enabled` 固定为 `false`，其余字段保持原状。验证：新增测试断言无 git 项目创建的 `policy.json` 中 `reviews.apply.enabled === false`、`git.enabled === false`，且 git 项目仍按设置锁定。
- [x] 1.2 在 `test/review.test.mjs` 增加「无 git 项目启用 apply 设置仍锁定关闭」与「git 项目保留 apply 启用」两条用例，使用 `openspec_new_change` 创建真实 change。验证：`node --test test/review.test.mjs` 通过。

## 2. apply status 报告 policy、enabled 与 available

- [x] 2.1 在 `lib/tools/review.js` 的 `REVIEW_OUTPUT_SCHEMA` 增加可选 `policy`、`enabled`、`available` 布尔字段，并让 `reviewStatus` 读取策略与 git 计算三者；`policy` 表示策略的 apply 段存在（draft-only 策略为 false），`enabled` 取自该段，`available` 取自 git，`available: false` 优先于无策略。apply 不可用、无策略或禁用时返回 `ready: false`、对应原因与 `nextAction`，不再抛错。验证：新增测试断言无策略与 draft-only 策略时 `policy: false`、`nextAction` 指向 start，且不再 reject。
- [x] 2.2 增加 status 用例：无 git 新策略（`policy: true`、`enabled: false`、`available: false`）、无 git 旧策略（`policy: true`、`enabled: true`、`available: false`）、无 git 无策略（`policy: false`、`available: false`、指向归档）、git 禁用策略（`policy: true`、`enabled: false`、`available: true`、指向归档）、git 已启用未开始（三者 true、指向 start）、git 无策略（`policy: false`、`enabled: false`、`available: true`、指向 start）、git draft-only 策略（`policy: false`、`enabled: false`、`available: true`、指向 start）。验证：`node --test test/review.test.mjs` 通过。
- [x] 2.3 改写 `test/review.test.mjs` 中「apply status is unavailable without git」的拒绝断言为状态断言，保留 apply start 的拒绝断言。验证：`grep -n "apply status is unavailable" test/review.test.mjs` 显示状态断言，且 start 仍使用 `assert.rejects`。
- [x] 2.4 增加 draft-only 策略的迁移用例：status 返回 `policy: false` 后调用 apply start，断言 `ensureApplyPolicy` 写入 apply 段并记录迁移后的策略。验证：`node --test test/review.test.mjs` 通过，且测试读取策略文件确认 apply 段存在。

## 3. 归档在无 git 时跳过 apply 闸门

- [x] 3.1 在 `test/review.test.mjs` 增加回归用例：在无 git 夹具中写入 `reviews.apply.enabled: true` 的旧策略，保持全局 apply 启用，调用 `openspec_archive` 并断言归档成功。验证：`node --test test/review.test.mjs` 通过，且用例不使用 git 仓库。
- [x] 3.2 复核 `assertApplyReviewReady` 在无 git 时的早退分支仍在策略读取之前，避免本次改动把等待重新引入。验证：`grep -n "isGitRepository" lib/tools/review.js` 显示该分支位于 `readPolicy` 之前。

## 4. 技能、规则与文档同步

- [x] 4.1 更新 `skills/openspec-archive-change/SKILL.md`：依据 `available`/`policy`/`enabled` 分支，仅在存在策略、已启用且可执行但未就绪时停止；不可用、无策略或禁用时说明原因并继续。更新 `skills/openspec-apply-change/SKILL.md`：无 git 或已锁定策略禁用时跳过，git 项目无策略时先 start 以锁定策略。验证：`test/skills.test.mjs` 断言两份技能包含 `policy`/`available`/`enabled` 分支并更新通过。
- [x] 4.2 更新 `lib/policy.js` 流程规则第 8 条：apply review 仅在变更启用且项目有 git 时作为归档前置；禁用或不可用时归档不等待。新增 `test/policy.test.mjs` 断言匹配第 8 条中可区分的新措辞（如 `does not hold archive`），避免仅命中第 6 条已有的 `no apply review`。验证：`node --test test/policy.test.mjs` 通过。
- [x] 4.3 更新 `docs/review.md` 与 `README.md`：写明无 git 项目新建策略锁定 apply review 关闭、旧策略可能仍记录启用但 status 报告不可用、无策略与 draft-only 策略的 `policy: false`、status 的 `policy`/`enabled`/`available` 含义（含 unavailable 优先）、归档不等待不可用或禁用的评审。验证：`test/review-doc.test.mjs` 通过，且文档不再出现「归档会一直等到 apply review 就绪」。
- [x] 4.4 更新 `test/review-doc.test.mjs` 与 `test/skills.test.mjs` 的措辞断言，覆盖无 git 新策略、旧策略、无策略、draft-only 与禁用分支。验证：`node --test test/review-doc.test.mjs test/skills.test.mjs test/policy.test.mjs` 通过。

## 5. 集成验证

- [x] 5.1 运行 `openspec_inspect` 的 `action: "validate"`（`strict: true`）确认 change 与全部主规格通过。验证：结果无 finding。
- [x] 5.2 在 Node 24 运行 `npm test` 与 `npm run coverage:check`。验证：命令退出码为 0，覆盖率门槛通过。
- [x] 5.3 运行 `npm run contract:check -- --candidate-bin node_modules/.bin/openspec` 与 `npm run openspec:check`。验证：命令退出码为 0。

## Workflow follow-up

- 提交实现后运行 apply review；修复全部 blocker 直至 ready。
- 归档仅在用户明确要求时执行。
- 归档后提交归档产物、文档与合并后的规格，并推送到 `origin/main`。
- 单独修复 reviewer 在 round 2 及以后未被自动唤醒的问题：`start` 只在 slot 为空时激活，本轮用 `retry` 唤醒；该缺陷不属于本 change 的行为范围。
