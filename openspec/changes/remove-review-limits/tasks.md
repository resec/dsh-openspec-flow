# Tasks

## 1. 移除报告校验的上限

- [x] 1.1 删除 `lib/review/report.js` 的 `TEXT_LIMIT` 常量、`text()` 的 `limit` 参数与长度分支，以及四处实参（`1000`、`500`）和 `outOfScope`/`residualRisks` 的 3 条上限；保留非空、类型与结构校验。验证：`grep -rn "TEXT_LIMIT\|at most 3 entries" lib/review/report.js` 无输出，且 `node --input-type=module -e` 直接调用 `assertReport` 提交 5 000 字符的 `problem` 与 4 条 `outOfScope` 时不再抛错。
- [x] 1.2 改写 `test/review-unit.test.mjs` 中 `report text limits and deferred dispositions cover their branches` 与 3 条上限的断言为接受断言，并新增超长 finding 字段与 4 条 `outOfScope` 的用例。验证：`node --test test/review-unit.test.mjs` 通过。

## 2. 移除 reviewer 重试与替换次数上限

- [x] 2.1 删除 `lib/tools/review.js` 中 `retryReview` 与 `replaceReview` 的次数守卫，保留 `retries` 计数与 `replacements` 记录。验证：`grep -rn "already retried once\|already replaced once" lib/` 无输出。
- [x] 2.2 在 `test/review.test.mjs` 用 `externalSetup` 新增连续两次 `retry` 与连续两次 `replace` 的用例，断言两次调用都成功且 slot 记录两次重试、两次替换。验证：`node --test test/review.test.mjs` 通过。

## 3. 文档与规格同步

- [x] 3.1 更新 `docs/review.md`：删去「`retry` … 只允许一次；`replace` … 只允许一次」，改为可重复并保留原因记录；在报告与 finding 小节写明字段不设字符上限、`outOfScope`/`residualRisks` 不设条数上限。验证：`grep -rn "只允许一次" docs/` 无输出，且小节内容与新规格一致。

## 4. 集成验证

- [x] 4.1 运行 `openspec_inspect` 的 `action: "validate"`（`strict: true`）与 `npm test`、`npm run coverage:check`，确认全部通过且无新增告警。

## Workflow follow-up

- 提交实现后运行 apply review，修复全部 blocker。
- 归档仅在用户明确要求时执行。
- 归档后提交归档产物、文档与合并后的规格，并推送到 `origin/main`。
