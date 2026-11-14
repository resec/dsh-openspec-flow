# Fix apply review in projects without git

## Why

apply review 的对象是已提交的 git tree，没有 git 仓库的项目无法执行它。当前 `openspec_new_change` 在锁定策略时仍按全局设置写入 `reviews.apply.enabled: true`，同时把 `git.enabled` 记为 `false`；变更因此声明了一个永远无法启动的评审。

归档工具本身已在无 git 项目跳过 apply 闸门，但 `openspec_review` 的 apply status 在该场景直接报错。归档技能要求先查 status，并把「已启用且未就绪」当作停止条件，于是代理可能报告 blocker 并等待一个不可能就绪的评审。流程规则第 8 条与 `docs/review.md` 又写成归档前必须等 apply review 就绪，进一步强化了等待。

## What Changes

- 无 git 项目创建 change 或首次锁定策略时，`reviews.apply.enabled` 固定为 `false`，忽略全局设置中的 apply 启用值；`git.enabled: false` 继续记录原因。apply 段的其余字段与 reviewer 模型锁定方式不变。
- `openspec_review` 的 apply status 增加可选字段 `policy`、`enabled` 与 `available`。`policy` 表示策略的 apply 段存在（draft-only 策略为 false），`enabled` 取自该段，`available` 表示项目是否具备 git；`available: false` 优先于无策略。status 不再报错：无 git 时报告不可用并指向归档；策略禁用时报告禁用并指向归档；没有策略或只有 draft 段时报告首个 start 会锁定/迁移策略并指向 start；已启用可执行时按就绪度返回 start 或就绪。apply start 仍拒绝禁用或无 git 的请求。
- 旧的无 git 策略仍可能在文件中记录 `reviews.apply.enabled: true`；status 报告 `policy: true`、`enabled: true`、`available: false`，归档照常跳过，不迁移策略文件。
- `openspec_archive` 的 apply 闸门保持不变：无 git 时直接跳过。新增回归测试覆盖「策略仍启用但项目无 git」的旧记录。
- 归档与实施技能、流程规则、README、`docs/review.md` 明确区分「未就绪」「不可用」「无策略」与「已禁用」；实施技能在 git 项目无策略时先 start 以锁定策略。
- 新增策略锁定、status 契约、归档跳过、技能分支与文档措辞的回归测试。

不在本次范围：git 仓库但没有任何提交（`HEAD` 无法解析）仍要求先提交；draft review 的无 git 行为不变；不迁移已有策略文件；不拒绝无 git 项目的 change 创建。

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `change-review`：策略在无 git 项目锁定 apply review 关闭，即使全局设置启用；旧策略的启用状态保留但不可用。
- `tool-surface`：apply status 报告 `policy`/`enabled`/`available`，区分无策略、不可用与禁用，不再失败。
- `skill-adaptation`：归档技能在不可用、无策略或禁用时继续；实施技能在无策略时先 start 锁定策略，只在不可用或禁用时跳过。
- `flow-policy`：规则文本说明无 git 或禁用时归档不等待 apply review。
- `review-documentation`：文档写明无 git 项目、旧策略、无策略与 draft-only 策略、status 字段以及归档不等待的关系。

## Impact

- `lib/review/policy.js`：`buildPolicy` 在 `gitEnabled` 为假时关闭 apply 段。
- `lib/tools/review.js`：review 输出 schema 与 status 投影。
- `lib/policy.js`：流程规则第 8 条。
- `skills/openspec-apply-change/SKILL.md`、`skills/openspec-archive-change/SKILL.md`：无策略、无 git、禁用与未就绪分支。
- `README.md`、`docs/review.md`：工具与流程说明。
- `test/review.test.mjs`、`test/policy.test.mjs`、`test/review-doc.test.mjs`、`test/skills.test.mjs`：回归用例与文档断言。
- 无新增依赖、配置键或 CLI 调用；工具输出只新增可选字段，现有字段不变。
