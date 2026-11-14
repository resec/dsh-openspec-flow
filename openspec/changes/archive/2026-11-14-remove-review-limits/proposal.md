# Remove review limits

## Why

评审报告带三类未完全记录的上限：字段字符数（120/500/1000）、`outOfScope`/`residualRisks` 最多 3 条、reviewer `retry` 与 `replace` 各 1 次。字符数与条数上限只存在于代码，规格、README、docs 与模型可见的 brief/schema 均未记载；调用方只能靠报错试错，而报告校验发生在写入之前，一个字段超长会让整份报告连同已写好的 finding 一起作废。

这些上限也不保护任何系统约束：就绪度与处置只依赖 finding 的 id 与状态，报告文本默认不进入上下文，单份报告记录不足 1 KB。上限只把"长文本"挡在正确的位置之外，没有换来存储、上下文或一致性的收益。

## What Changes

- 移除报告文本长度校验：`summary`、finding 的 `location`、`title`、`problem`、`evidence`、`suggestion`、blocking finding 的 `impact`、`rule`、`failure`、`verification.evidence`、`outOfScope`/`residualRisks` 的单条文本都不再限制字符数；保留非空与类型校验。
- 移除 `outOfScope`/`residualRisks` 最多 3 条的限制；保留数组类型与条目非空校验。
- 移除 `retry` 与 `replace` 各一次的限制；`retries` 计数与 `replacements` 记录继续保留，供状态与审计使用。
- 更新 `docs/review.md`：报告契约写明不设长度与条数上限；失败处理改为可重复重试与替换。
- 更新 `change-review` 规格的两条需求，把上述契约写进规格。

**BREAKING**：原先被上限拒绝的报告现在会被接受；依赖该拒绝行为的调用方需自行约束输入。

## Capabilities

### Modified Capabilities

- `change-review`：自评审报告的校验契约从"长度与条数受限"改为"只校验必填与结构"；reviewer 失败处理不再限制 `retry` 与 `replace` 的次数。

## Impact

- `lib/review/report.js`：删除 `TEXT_LIMIT`、`text()` 的 `limit` 参数、1000/500/60 三个实参与 3 条上限判断。
- `lib/tools/review.js`：删除 `retry` 与 `replace` 的次数守卫。
- `test/review-unit.test.mjs`、`test/review.test.mjs`：改写上限断言，新增超长字段、超过 3 条与重复 `retry`/`replace` 的回归用例。
- `docs/review.md`：报告契约与失败处理两处。
- 无依赖、配置、存储格式或工具 schema 变化。
