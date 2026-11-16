## Why

本仓库把 change 的完成判据写成两个并列命令：`npm test` 与 `npm run coverage:check`。但 `coverage:check` 内部已经通过 `scripts/coverage.mjs` 跑完整套插件测试（`run-tests.mjs all`），先跑的 `npm test` 结果必然被丢弃。最近三天会话中 40 次成功的全量测试在 15 分钟内被覆盖度检查完整重跑，合计 37.8 分钟，全部属于重复执行。

根因不在测试用例速度，而在验证入口的命名与流程安排：`coverage:check` 看起来只查覆盖率，于是流程文档要求再补一次 `npm test`。合并为单一入口即可消除这次重复，且不改变任何测试或覆盖率精度。

## What Changes

- 新增 npm script `verify`：`node scripts/coverage.mjs --check`，一次运行同时产出测试结果与覆盖率判定。
- 完成判据从「`npm test` 通过且 `npm run coverage:check` 通过」改为「`npm run verify` 通过」，`openspec_inspect` 的 strict 校验仍单独要求。
- `.githooks/pre-push` 的覆盖率步骤改调 `npm run verify`；`COVERAGE_SKIP=1` 跳过范围不变。
- 同步 `scripts/install-hooks.mjs` 的安装提示，避免它继续告知钩子运行 `coverage:check`。
- 同步 `AGENTS.md`、`README.md`、两份升级指南（`docs/upgrading-openspec-cli.md`、`docs/upgrading-dsh-runtime.md`）与 `development-workflow` 规格中的验证表述。
- `coverage:check` 保留为低层别名，`coverage`、`coverage:baseline`、`COVERAGE=1 npm test` 等现有入口不变。
- 新增测试断言 `package.json` 含 `verify` 脚本且 `pre-push` 调用它。

不涉及破坏性变更：`verify` 为新增脚本，钩子仍执行同一套检查。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `development-workflow`：验证闸门的完成判据从两个并行命令改为单一 `npm run verify`；OpenSpec CLI 升级的验证场景同步改用该入口。

## Impact

- 配置与脚本：`package.json`、`.githooks/pre-push`、`scripts/install-hooks.mjs`
- 测试：`test/hooks.test.mjs`
- 文档与规格：`AGENTS.md`、`README.md`、`docs/upgrading-openspec-cli.md`、`docs/upgrading-dsh-runtime.md`、`openspec/specs/development-workflow/spec.md`（经 delta 归档合并）
- 不涉及 `lib/` 运行时代码，覆盖率数值与门禁阈值不变。
