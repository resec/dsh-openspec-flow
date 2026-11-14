# Fix reviewer activation

## Why

独立 reviewer 在 pinned 运行时 DSH 0.2.2-rc.2 下必然启动失败。插件把 `parent`、`cwd`、`prompt`、`agentPreset` 放进 `startActivation` 的 `request` 子对象，而服务的激活契约是扁平结构，直接读取 `spec.parent.id`；`spec.parent` 为 `undefined`，于是抛出 `Cannot read properties of undefined (reading 'id')`。

现有测试用假 `subagents` 服务，只记录参数、不校验形状，并且断言的就是错误的 `request.*` 嵌套，因此单测通过而真实路径不可用。本变更修正调用形状并让测试锁定服务契约。

## What Changes

- 把 `startReviewerActivation` 的激活参数改为扁平结构：`parent`、`cwd`、`prompt`、`agentPreset`、`agentOptions`、`signal` 与 `provider`、`label`、`delivery` 同级，删除 `request` 子对象。
- 更新测试断言：`activations[0].agentPreset`、`activations[0].agentOptions` 改为顶层字段。
- 新增回归断言：`activations[0].parent.id` 为发起评审的 agent，且 `activations[0].request` 为 `undefined`。
- 新增 `change-review` 需求，把激活请求的扁平契约写入规格：`parent`、`prompt`、`agentPreset`、`agentOptions` 与 `signal` 位于请求顶层，缺少调用方 agent 时失败关闭。

## Capabilities

### Modified Capabilities

- `change-review`：新增一条激活请求契约需求，约束激活参数必须由服务的顶层字段承载。

## Impact

- `lib/tools/review.js`：`startReviewerActivation` 的 `startActivation` 调用。
- `test/review.test.mjs`：三处 `request.*` 断言与新增回归断言。
- 无依赖、配置、报告格式或存储变化。
- 运行时影响：修复需要重新加载 Host 插件后才在 live 会话生效；本次仅由测试验证。
